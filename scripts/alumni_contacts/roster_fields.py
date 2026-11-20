"""Build the minimal People update for one independently identified roster member."""

from copy import deepcopy
from uuid import UUID

from .compare import MANAGED_GROUPS, MOBILE_TYPES, _text, mobile_key
from .writes import READ_ONLY


def _replace_text(item, key, value):
    if value:
        item[key] = value
    else:
        item.pop(key, None)


def _names(row, items):
    if len(items) > 1:
        raise ValueError("이름 항목이 여러 개입니다.")
    name = items[0] if items else {}
    for field, key in (("first", "givenName"), ("last", "familyName")):
        _replace_text(name, key, row[field])
    return [name]


def _phones(row, items, previous_phone):
    desired = mobile_key(row["phone"])
    if not desired:
        raise ValueError("명부 휴대전화 형식을 확인하세요.")
    matches = [item for item in items if mobile_key(item.get("value")) == desired]
    if len(matches) > 1:
        raise ValueError("명부 번호와 같은 전화 항목이 여러 개입니다.")
    if matches:
        matches[0]["type"] = "mobile"
        return items

    if previous_phone:
        old = mobile_key(previous_phone)
        matches = [item for item in items if old and mobile_key(item.get("value")) == old]
        if len(matches) != 1:
            raise ValueError("확인한 이전 번호의 전화 항목을 하나로 특정할 수 없습니다.")
    else:
        matches = [
            item for item in items
            if _text(item.get("type")).lstrip("*").strip().casefold() in MOBILE_TYPES
        ]
        if len(matches) > 1:
            raise ValueError("기존 휴대전화 중 명부용 항목을 특정할 수 없습니다.")
    if matches:
        matches[0].update(value=row["phone"], type="mobile")
    else:
        items.append({"value": row["phone"], "type": "mobile"})
    return items


def _organizations(row, items):
    group, title = row["org"], row["title"]
    managed = [
        i for i, item in enumerate(items)
        if _text(item.get("name")) in MANAGED_GROUPS
        or (group and _text(item.get("name")) == _text(group))
        or (not group and title and not item.get("name") and item.get("title") == title)
    ]
    if len(managed) > 1:
        raise ValueError("동문 분류용 조직 항목이 여러 개입니다.")
    if not managed and not (group or title):
        return items
    if managed:
        index = managed[0]
    else:
        index = len(items)
        items.append({})
    org = items[index]
    _replace_text(org, "name", group)
    _replace_text(org, "title", title)
    if not group and not title and not any(v for k, v in org.items() if k != "type"):
        items.pop(index)
    return items


def _user_defined(row, items):
    uid = row["uid"]
    try:
        parsed = UUID(uid)
    except (ValueError, AttributeError, TypeError):
        raise ValueError("명부 동문 UUID 형식을 확인하세요.") from None
    if parsed.version != 4 or str(parsed) != uid:
        raise ValueError("명부 동문 UUID가 정규 UUIDv4 형식이어야 합니다.")
    matches = [i for i, item in enumerate(items) if item.get("key") == "alumni_uid"]
    if not matches:
        return [*items, {"key": "alumni_uid", "value": uid}]
    if any(items[i].get("value") not in ("", None, uid) for i in matches):
        raise ValueError("카드에 다른 동문 UUID가 있습니다.")
    items[matches[0]]["value"] = uid
    for i in reversed(matches[1:]):
        items.pop(i)
    return items


def changes(row, person, previous_phone=None):
    """Return changed arrays only; the caller verifies identity, label and etag."""
    fields = {}
    for field, edit in (("names", _names), ("phoneNumbers", _phones),
                        ("organizations", _organizations), ("userDefined", _user_defined)):
        raw = person.get(field, [])
        ignored = READ_ONLY.get(field, {"metadata"})
        original = [{k: v for k, v in item.items() if k not in ignored} for item in raw]
        items = deepcopy(original)
        wanted = edit(row, items, previous_phone) if field == "phoneNumbers" else edit(row, items)
        if wanted == original:
            continue
        sources = person.get("metadata", {}).get("sources", [])
        contact_ids = {s.get("id") for s in sources if s.get("type") == "CONTACT"}
        if len(contact_ids) > 1:
            raise ValueError("연락처 원본이 여러 개입니다.")
        for item in raw:
            source = item.get("metadata", {}).get("source", {})
            if (source.get("type") not in (None, "CONTACT") or
                    (source.get("id") and contact_ids and source["id"] not in contact_ids)):
                raise ValueError("수정 필드에 다른 원본의 값이 있습니다.")
        fields[field] = wanted
    return fields
