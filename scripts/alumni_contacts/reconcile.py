"""Reconcile the alumni label using a fixed, reviewed UUID-to-contact plan."""
import argparse
from collections import Counter, defaultdict
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import unicodedata

from .compare import _name_key, compare, mobile_key
from .formats import people_card
from .roster_batch import apply_batches
from .roster_fields import changes
from .roster_source import account, read_roster
from .writes import _contact_source, _memberships


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fingerprint(value):
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def compact(value):
    return "".join(unicodedata.normalize("NFC", value).split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(api):
    rows = read_roster(api)
    people, group, press = api.inventory()
    persons = {p["resourceName"]: p for p in people}
    return rows, persons, group, press


def fixed_plan(data, proof_path):
    rows, persons, group, press = data
    cards = [people_card(p, group, press) for p in persons.values()]
    by_num, by_name, by_uid = defaultdict(set), defaultdict(set), defaultdict(set)
    source_names = Counter(_name_key(r) for r in rows)
    proof_rows = json.loads(proof_path.read_text())["rows"] if proof_path else []
    proof = {e["uid_sha256"]: e for e in proof_rows}
    for card in cards:
        rid = card["id"]
        for phone in filter(None, map(mobile_key, card["phones"])):
            by_num[digest(phone)].add(rid)
        by_name[_name_key(card)].add(rid)
        for item in persons[rid].get("userDefined", []):
            if item.get("key") == "alumni_uid" and item.get("value"):
                by_uid[item["value"]].add(rid)
    all_status = {r["row"]: r["status"] for r in compare(rows, cards)}
    bindings = {}
    for row in rows:
        uid, name, phone = row["uid"], _name_key(row), mobile_key(row["phone"])
        names, phones = by_name[name], by_num[digest(phone)]
        prev = proof.get(digest(uid))
        old_hash = ""
        if prev:
            require(prev["current_phone_sha256"] == digest(phone)
                    and prev["norm_name_sha256"] == digest(compact(row["first"]))
                    and prev["norm_cohort_sha256"] == digest(compact(row["cohort"])),
                    f"{row['row']}행의 보존본 근거와 현재 명부가 다릅니다.")
            old_hash = prev["old_phone_sha256"]
        old_cards = by_num.get(old_hash, set())
        if by_uid.get(uid):
            ids, basis = by_uid[uid], "uuid"
        elif len(names & phones) == 1:
            ids, basis = names & phones, "name_and_phone"
        elif len(names & old_cards) == 1:
            ids, basis = names & old_cards, "archive_phone_and_name"
        elif len(names) == source_names[name] == 1:
            ids, basis = names, "unique_cohort_and_name"
        elif all_status[row["row"]] in {"same", "update", "organization_review"}:
            ids, basis = phones, "unique_phone"
        else:
            ids, basis = set(), "unresolved"
        require(len(ids) == 1, f"{row['row']}행의 대상 카드 후보 {len(ids)}개.")
        rid = next(iter(ids))
        labels = _memberships(persons[rid])
        require(group in labels and press not in labels, f"{row['row']}행 라벨 충돌.")
        bindings[uid] = {"id": rid, "basis": basis, "old": old_hash}
    expected = {rid for rid, p in persons.items() if group in _memberships(p)}
    assigned = {m["id"] for m in bindings.values()}
    require(len(bindings) == len(assigned) and expected == assigned, "명부와 라벨의 전체 일대일 연결이 성립하지 않습니다.")
    outside = {rid: fingerprint(p) for rid, p in persons.items() if rid not in expected}
    return dict(bindings=bindings, source=fingerprint(sorted(rows, key=lambda r: r["uid"])),
                group=group, press=press, outside=outside)


def materialize(data, plan):
    rows, persons, group, press = data
    require(plan["source"] == fingerprint(sorted(rows, key=lambda r:r["uid"])), "검토 후 명부가 달라졌습니다.")
    require((group, press) == (plan["group"], plan["press"]), "라벨이 달라졌습니다.")
    targets = {rid for rid, p in persons.items() if group in _memberships(p)}
    require({m["id"] for m in plan["bindings"].values()} == targets, "대상 라벨 구성원이 변경됐습니다.")
    require(plan["outside"] == {rid: fingerprint(p) for rid, p in persons.items() if rid not in targets},
            "라벨 밖 카드의 구성 또는 버전이 변경됐습니다.")
    projected = dict(persons)
    items = []
    fields = Counter()
    for row in rows:
        binding = plan["bindings"][row["uid"]]
        rid = binding["id"]
        person = persons[rid]
        require(press not in _memberships(person), f"{row['row']}행이 보호 라벨에 속합니다.")
        prev = next((v["value"] for v in person.get("phoneNumbers", [])
                     if digest(mobile_key(v.get("value"))) == binding["old"]), None)
        try:
            updates = changes(row, person, previous_phone=prev)
        except ValueError as exc:
            raise ValueError(f"{row['row']}행 변경 보류: {exc}") from None
        if updates:
            items.append((person, updates))
            fields.update(updates.keys())
            projected[rid] = {**person, **updates}
    statuses = Counter(r["status"] for r in compare(rows, [people_card(p, group, press) for p in projected.values()]))
    require(statuses == {"same": len(rows)}, f"예상 결과에 미해결 건이 있습니다: {dict(statuses)}")
    for row in rows:
        card = projected[plan["bindings"][row["uid"]]["id"]]
        require([e.get("value") for e in card.get("userDefined", []) if e.get("key") == "alumni_uid"] == [row["uid"]],
                f"{row['row']}행 UUID 대조 실패.")
    return items, dict(fields)


def plan_versions(items):
    return {p["resourceName"]: fingerprint([_contact_source(p), fields]) for p, fields in items}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["preview", "apply", "verify"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--proof", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    directory = args.directory
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    plan_path = directory / "plan.json"
    if args.mode == "preview":
        data = read(account())
        plan = fixed_plan(data, args.proof)
        items, fields = materialize(data, plan)
        plan["pending_versions"] = plan_versions(items)
        with plan_path.open("x") as f:
            json.dump(plan, f, ensure_ascii=False)
        print(json.dumps(dict(eligible=len(items), fields=fields,
              mapping=Counter(m["basis"] for m in plan["bindings"].values())), ensure_ascii=False), flush=True)
        return
    plan = json.loads(plan_path.read_text())
    if args.mode == "verify":
        data = read(account())
        items, fields = materialize(data, plan)
        print(json.dumps(dict(members=len(plan["bindings"]), remaining=len(items), fields=fields,
                              outside=len(plan["outside"]), press=sum(plan["press"] in _memberships(p) for p in data[1].values()))), flush=True)
        require(not items, "주소록에 반영할 변경이 남았습니다.")
        return
    api = account(write=True)
    with (api.token_path.parent / "operations.jsonl").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        data = read(api)
        items, fields = materialize(data, plan)
        require(all(plan["pending_versions"].get(rid) == version for rid, version in plan_versions(items).items()),
                "미반영 카드의 버전이나 변경값이 미리보기와 달라졌습니다.")
        with (directory / "checkpoint.jsonl").open("a") as log:
            verified = 0
            def record(event, resources):
                nonlocal verified
                log.write(json.dumps([int(time.time()), event, resources]) + "\n")
                log.flush()
                os.fsync(log.fileno())
                if event == "verified":
                    verified += len(resources)
                    print(f"검증 {verified}/{len(items)}", flush=True)
            apply_batches(api, items, plan["group"], plan["press"], record)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError) as exc:
        sys.exit(str(exc))
