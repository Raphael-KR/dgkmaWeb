"""Apply a single reviewed, live People API decision and verify the saved card."""

from collections import Counter
from copy import deepcopy
import json

from .compare import MANAGED_GROUPS, compare, managed_org_index, mobile_key
from .formats import people_card


FIELDS = {"first", "last", "phone_type", "org", "title"}
READ_ONLY = {
    "names": {"metadata", "displayName", "displayNameLastFirst"},
    "phoneNumbers": {"metadata", "formattedType", "canonicalForm"},
    "organizations": {"metadata", "formattedType"},
}


def _memberships(person):
    return {
        entry["contactGroupMembership"]["contactGroupResourceName"]
        for entry in person.get("memberships", [])
        if "contactGroupMembership" in entry
    }


def _contact_source(person):
    sources = [item for item in person.get("metadata", {}).get("sources", [])
               if item.get("type") == "CONTACT"]
    if len(sources) != 1 or not sources[0].get("id") or not sources[0].get("etag"):
        raise ValueError("연락처의 고유 CONTACT 소스와 버전을 확인할 수 없습니다.")
    return {key: sources[0][key] for key in ("type", "id", "etag")}


def _items(person, field):
    return [{key: deepcopy(value) for key, value in item.items() if key not in READ_ONLY[field]}
            for item in person.get(field, [])]


def _snapshot(person, field):
    # Ignore output formatting, ordering and absent empty strings in API readback.
    result = Counter()
    for item in _items(person, field):
        if field == "phoneNumbers" and item.get("value"):
            item["value"] = mobile_key(item["value"]) or item["value"]
        result[json.dumps({k: v for k, v in item.items() if v != ""}, sort_keys=True)] += 1
    return result


def _create_body(source, group):
    name = {"givenName": source["first"], "familyName": source["last"]}
    person = {
        "names": [{key: value for key, value in name.items() if value}],
        "phoneNumbers": [{"value": source["phone"], "type": "mobile"}],
        "memberships": [{"contactGroupMembership": {"contactGroupResourceName": group}}],
    }
    if source["org"] or source["title"]:
        org = {"name": source["org"], "title": source["title"]}
        person["organizations"] = [{key: value for key, value in org.items() if value}]
    return person


def _update_body(source, current, diff):
    body = {"resourceName": current["resourceName"], "metadata": {"sources": [_contact_source(current)]}}
    changed = []
    if diff & {"first", "last"}:
        names = _items(current, "names") or [{}]
        if len(names) != 1:
            raise ValueError("수정할 이름을 하나로 식별할 수 없습니다.")
        for field, key in (("first", "givenName"), ("last", "familyName")):
            if field in diff:
                names[0][key] = source[field]
        body["names"] = names
        changed.append("names")
    if "phone_type" in diff:
        phones = _items(current, "phoneNumbers")
        matches = [item for item in phones if mobile_key(item.get("value")) == mobile_key(source["phone"])]
        if len(matches) != 1:
            raise ValueError("수정할 휴대전화를 하나로 식별할 수 없습니다.")
        matches[0]["type"] = "mobile"
        body["phoneNumbers"] = phones
        changed.append("phoneNumbers")
    if diff & {"org", "title"}:
        orgs = _items(current, "organizations")
        index = managed_org_index(source, {"orgs": orgs})
        if index is None:
            index = len(orgs)
            orgs.append({})
        for field, key in (("org", "name"), ("title", "title")):
            if field in diff:
                orgs[index][key] = source[field]
        body["organizations"] = orgs
        changed.append("organizations")
    return body, changed


def apply_one(api, source, card_or_none, group, press_group, diff):
    """Return a verified resourceName. The caller journals a pending write first.

    The caller must build a fresh, account-wide plan under its local write lock
    and call only for new_candidate (empty diff) or update. On any uncertain
    create outcome it must reconcile before sending another create for that PK.
    """
    if not group or not press_group or group == press_group:
        raise ValueError("가져오기 라벨과 신문사 라벨을 모두 확인해야 합니다.")
    diff = set(diff)
    if (not mobile_key(source["phone"]) or not (source["first"].strip() or source["last"].strip())
            or diff - FIELDS):
        raise ValueError("명부의 이름, 휴대전화 또는 관리 대상 필드를 확인하세요.")
    if source["org"].strip() and source["org"].strip() not in MANAGED_GROUPS:
        raise ValueError("원본의 동문 분류를 검토해야 합니다.")
    if not source["org"].strip() and (source["title"].strip() or diff & {"org", "title"}):
        raise ValueError("동문 분류가 비어 있는 조직 변경은 검토해야 합니다.")

    if card_or_none is None:
        if diff:
            raise ValueError("신규 후보에 수정 필드가 들어 있습니다.")
        expected = _create_body(source, group)
        saved = api.create_contact(expected)
        resource = saved.get("resourceName")
    else:
        resource = card_or_none["resourceName"]
        current = api.get_contact(resource)
        if (current.get("resourceName") != resource
                or _contact_source(current) != _contact_source(card_or_none)):
            raise ValueError("비교 시점 이후 연락처의 소스 또는 버전이 달라졌습니다.")
        card = people_card(current, group, press_group)
        check = compare([source], [card])[0]
        if check["status"] != "update" or set(check["diff"]) != diff:
            raise ValueError("현재 라벨, 휴대전화 또는 변경 필드가 비교 결과와 다릅니다.")
        body, fields = _update_body(source, current, diff)
        expected = {**current, **body}
        saved = api.update_contact(body, fields)

    if not resource or saved.get("resourceName") != resource:
        raise ValueError("쓰기 응답의 연락처 식별자를 확인할 수 없습니다. 재조회가 필요합니다.")
    actual = api.get_contact(resource)
    actual_groups = _memberships(actual)
    if (actual.get("resourceName") != resource or press_group in actual_groups
            or not _memberships(expected).issubset(actual_groups)
            or (card_or_none is not None and _memberships(expected) != actual_groups)):
        raise ValueError("쓰기 후 연락처 또는 라벨을 확인할 수 없습니다. 재조회가 필요합니다.")
    result = compare([source], [people_card(actual, group, press_group)])[0]
    if result["status"] != "same":
        raise ValueError("쓰기 후 이름, 휴대전화 또는 동문 분류가 명부와 다릅니다.")
    if card_or_none is not None and any(
        _snapshot(expected, field) != _snapshot(actual, field) for field in READ_ONLY
    ):
        raise ValueError("쓰기 후 기존 이름·전화·조직 세부값을 확인해야 합니다.")
    return resource
