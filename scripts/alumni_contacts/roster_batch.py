"""Sequential People API roster updates with contact version and independent readback checks."""

from collections import Counter, defaultdict
import re
import time
from uuid import UUID

from .google_api import CONTACT_SOURCE, GoogleApiError, _call
from .writes import READ_ONLY, _contact_source, _memberships, _snapshot


MANAGED = frozenset((*READ_ONLY, "userDefined"))
READ_FIELDS = "metadata,memberships,names,organizations,phoneNumbers,userDefined"
BATCH_SIZE = 100


def _custom(person):
    return Counter((entry.get("key", ""), entry.get("value", ""))
                   for entry in person.get("userDefined", []))


def _matches(actual, expected):
    return (_contact_source(actual)["id"] == _contact_source(expected)["id"]
            and _memberships(actual) == _memberships(expected)
            and _custom(actual) == _custom(expected)
            and all(_snapshot(actual, field) == _snapshot(expected, field) for field in READ_ONLY))


def _ok(response):
    return (isinstance(response, dict) and not response.get("status", {}).get("code")
            and response.get("httpStatusCode", 200) == 200)


def _read(api, resources):
    api._authorized()
    people = api._service("people", "v1").people()
    response = _call("동문 카드 묶음 재조회", people.getBatchGet(
        resourceNames=resources, personFields=READ_FIELDS, sources=CONTACT_SOURCE))
    result = {}
    for entry in response.get("responses", []):
        person = entry.get("person", {})
        name = person.get("resourceName")
        if (not _ok(entry) or name not in resources or name in result
                or entry.get("requestedResourceName", name) != name):
            raise GoogleApiError("묶음 조회에서 카드 ID 변경, 중복 또는 개별 조회 오류가 발생했습니다.")
        result[name] = person
    if len(result) != len(resources):
        raise GoogleApiError(f"묶음 재조회 응답이 누락됐습니다. 요청 {len(resources)}, 수신 {len(result)}.")
    return result


def _group_updates(items, group, press):
    groups = defaultdict(list)
    names, assigned = set(), set()
    for before, fields in items:
        name = before.get("resourceName", "")
        if (not re.fullmatch(r"people/[A-Za-z0-9_-]+", name) or name in names
                or group not in _memberships(before) or press in _memberships(before)):
            raise ValueError("동문 카드 ID, 중복 또는 보호 라벨을 확인하세요.")
        names.add(name)
        _contact_source(before)
        if not fields:
            continue
        if set(fields) - MANAGED or any(not isinstance(v, list) for v in fields.values()):
            raise ValueError("관리 범위 밖 필드 또는 잘못된 일괄 변경 형식입니다.")
        expected = {**before, **fields}
        old_custom, new_custom = _custom(before), _custom(expected)
        if ({kv: n for kv, n in old_custom.items() if kv[0] != "alumni_uid"}
                != {kv: n for kv, n in new_custom.items() if kv[0] != "alumni_uid"}):
            raise ValueError("명부 UUID 외의 기존 사용자 지정 항목이 변경됩니다.")
        ids = [e.get("value", "") for e in expected.get("userDefined", [])
               if e.get("key") == "alumni_uid"]
        if len(ids) != 1:
            raise ValueError("반영 후 동문 UUID가 정확히 한 개여야 합니다.")
        uid = UUID(ids[0])
        if (uid.version != 4 or str(uid) != ids[0] or uid in assigned):
            raise ValueError("유일한 정규 UUIDv4가 필요합니다.")
        assigned.add(uid)
        groups[",".join(sorted(fields))].append((before, fields))
    return groups


def _apply_chunk(api, chunk, mask, checkpoint):
    plan = {before["resourceName"]: (before, fields) for before, fields in chunk}
    names = list(plan)
    current = _read(api, names)
    contacts = {}
    expected = {}
    for name, (before, fields) in plan.items():
        expected[name] = {**before, **fields}
        if _matches(current[name], expected[name]):
            continue  # A previous write already reached exactly the intended state.
        if (_contact_source(current[name]) != _contact_source(before)
                or not _matches(current[name], before)):
            raise GoogleApiError("반영 전 조회에서 카드 버전이나 내용이 달라졌습니다. 다시 대조하세요.")
        contacts[name] = {"resourceName": name, "metadata": {"sources": [_contact_source(before)]},
                          **fields}
    if not contacts:
        if checkpoint:
            checkpoint("verified", names)
        return

    if checkpoint:
        checkpoint("pending", list(contacts))
    api._authorized()
    request = api._service("people", "v1").people().batchUpdateContacts(body={
        "contacts": contacts, "updateMask": mask, "readMask": READ_FIELDS,
        "sources": CONTACT_SOURCE,
    })
    error = ""
    try:
        response = api._mutate_once("동문 카드 일괄 수정", request)
        updated = response.get("updateResult", {})
        failures = [n for n in contacts if not _ok(updated.get(n))
                    or updated[n].get("person", {}).get("resourceName") != n]
        if failures or set(updated) != set(contacts):
            error = f"쓰기 응답 미확인 {len(failures)}건"
    except GoogleApiError as exc:
        # A timeout or 5xx can arrive after the provider committed some or all cards.
        error = str(exc)
    remaining = set(contacts)
    for delay in (0, 2, 6):
        if delay:
            time.sleep(delay)
        observed = _read(api, sorted(remaining))
        remaining = {n for n in remaining if not _matches(observed[n], expected[n])}
        if not remaining:
            break
    confirmed = [n for n in names if n not in remaining]
    if confirmed and checkpoint:
        checkpoint("verified", confirmed)
    if remaining:
        raise GoogleApiError(
            f"{error or '쓰기 후 값 불일치'}. 묶음 {len(names)}, 확인 {len(confirmed)}, "
            f"미확인 {len(remaining)}. 최신 계획으로 재대조하세요.")


def apply_batches(api, items, group, press, checkpoint=None):
    """Return verified changed-card count. checkpoint(event, resource_names) receives no field data."""
    if not group or not press or group == press or tuple(api._write_groups()) != (group, press):
        raise GoogleApiError("쓰기 계정의 동문·신문사 라벨이 승인된 대상과 다릅니다.")
    groups = _group_updates(items, group, press)
    verified = 0
    next_batch = time.monotonic()
    for mask, entries in groups.items():
        for start in range(0, len(entries), BATCH_SIZE):
            chunk = entries[start:start + BATCH_SIZE]
            time.sleep(max(0, next_batch - time.monotonic()))
            # The service charges per contact even for a single batch request.
            next_batch = time.monotonic() + len(chunk) / 9
            _apply_chunk(api, chunk, mask, checkpoint)
            verified += len(chunk)
    return verified
