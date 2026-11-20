"""Preview or apply selected alumni contact changes from the local command line."""
import argparse
import csv
import fcntl
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path

from .compare import compare, mobile_key
from .formats import people_card, read_contacts_csv, read_source_csv, source_rows


def fingerprint(value):
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode()).hexdigest()


STATUS = {
    "same": "일치", "update": "수정 후보", "new_candidate": "신규 후보",
    "source_invalid": "명부 키 확인", "duplicate_source_key": "명부 키 중복",
    "duplicate_target_key": "주소록 키 중복", "shared_card": "한 카드에 여러 명부 행",
    "identity_conflict": "이름과 키 교차 확인", "key_change_review": "번호 변경 확인",
    "protected": "신문사 보호", "outside_label": "대상 라벨 밖", "target_only": "주소록에만 있음",
    "organization_review": "조직 정보 확인", "source_namesake": "명부 동명이인 확인",
}

REASONS = {
    "key_change_review": "같은 기수·성명 카드가 있으나 명부 휴대전화 키로 연결되지 않음",
    "identity_conflict": "전화번호로 연결한 카드와 기수·성명으로 연결한 결과가 충돌함",
    "shared_card": "한 주소록 카드와 여러 명부 행이 연결됨",
    "organization_review": "동문 분류와 기존 조직 정보를 안전하게 대응시킬 수 없음",
    "new_candidate": "조회 범위에서 명부 키와 기수·성명 모두 발견되지 않음",
    "duplicate_target_key": "한 번호가 여러 주소록 카드에 연결됨",
    "source_namesake": "같은 기수·성명으로 신규 후보가 여러 건임",
}
FIELD_NAMES = {"first": "성명", "last": "기수 표기", "org": "동문 분류", "title": "직책",
               "phone_type": "전화 유형"}


def snapshot(args, api):
    if api is None:
        rows = read_source_csv(args.source_csv)
        cards = read_contacts_csv(args.contacts_csv)
        inventory, group, press = {}, None, None
    else:
        rows = source_rows(api.source_rows(args.sheet_id))
        people, group, press = api.inventory()
        inventory = {p["resourceName"]: p for p in people}
        if len(inventory) != len(people):
            raise ValueError("주소록 페이지 간 같은 연락처 ID가 반복됩니다. 새 미리보기가 필요합니다.")
        cards = sorted((people_card(person, group, press) for person in people),
                       key=lambda card: card["id"])
    records = compare(rows, cards)
    source_refs = [r["row"] for r in records if r["row"] is not None]
    if sorted(source_refs) != sorted(row["row"] for row in rows):
        raise ValueError("비교 결과에 원본 행 누락 또는 중복이 있습니다.")
    # Bind the approval to live inputs, including the versions used to preserve unowned fields.
    versions = sorted((k, s.get("id", ""), s.get("etag", "")) for k, p in inventory.items()
                      for s in p.get("metadata", {}).get("sources", []) if s.get("type") == "CONTACT")
    digest = fingerprint([args.sheet_id, group, press, rows, cards, versions, records])
    return rows, cards, records, digest, inventory, group, press


def safe_cell(value):
    s = str(value)
    return "'" + s if s.lstrip().startswith(("=", "+", "-", "@")) else s


def review_folder(folder, rows, cards, records, digest, live):
    folder.mkdir(mode=0o700, parents=True, exist_ok=False)
    by_row, by_card = {r["row"]: r for r in rows}, {c["id"]: c for c in cards}
    counts = Counter(r["status"] for r in records if r["row"] is not None)
    plan = {"version": 1, "mode": "people" if live else "csv", "digest": digest,
            "source_rows": len(rows), "target_cards": sum(c["target"] for c in cards),
            "press_overlap": sum(c["target"] and c["press"] for c in cards),
            "source_counts": dict(counts),
            "target_only_records": sum(r["row"] is None for r in records),
            "eligible": {str(r["row"]): r["status"] for r in records
                         if live and r["row"] is not None and r["status"] in {"new_candidate", "update"}}}
    with (folder / "plan.json").open("x", encoding="utf-8") as stream:
        json.dump(plan, stream, ensure_ascii=False, indent=2)
    with (folder / "review.csv").open("x", encoding="utf-8-sig", newline="") as stream:
        w = csv.writer(stream)
        w.writerow(["판정", "명부 행", "명부 기수 표기", "명부 성명", "명부 번호 끝4자리",
                    "명부 조직명", "명부 직책", "주소록 카드 참조", "주소록 이름",
                    "주소록 번호 끝4자리", "주소록 조직·직책", "차이 또는 확인 근거"])
        for r in records:
            row = by_row.get(r["row"], {})
            matches = [by_card[k] for k in r["ids"]]
            visible = [c for c in matches if c["target"] and not c["press"]]
            cells = [STATUS.get(r["status"], r["status"]), r["row"] or "", row.get("last", ""),
                     row.get("first", ""), row.get("phone", "")[-4:], row.get("org", ""),
                     row.get("title", ""), " / ".join(c["id"] for c in visible),
                     " / ".join(c["last"] + " " + c["first"] for c in visible),
                     " / ".join(", ".join(p[-4:] for p in c["phones"]) for c in visible),
                     " / ".join(", ".join((o["name"] + " " + o["title"]).strip() for o in c["orgs"])
                                for c in visible), ", ".join(FIELD_NAMES[f] for f in r["diff"])
                     or REASONS.get(r["status"], "")]
            w.writerow(map(safe_cell, cells))
    print(json.dumps({k: v for k, v in plan.items() if k not in {"eligible", "digest"}},
                     ensure_ascii=False))


def apply(args, api, log):
    from .writes import apply_one
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    if plan.get("mode") != "people" or plan.get("version") != 1:
        raise ValueError("적용하려면 People API로 생성한 미리보기가 필요합니다.")
    rows, _, records, digest, inventory, group, press = snapshot(args, api)
    if plan.get("digest") != digest:
        raise ValueError("미리보기 이후 자료가 변경됐습니다. 새 미리보기를 확인하세요.")
    by_row = {row["row"]: row for row in rows}
    by_result = {r["row"]: r for r in records if r["row"] is not None}
    selected = list(dict.fromkeys(args.rows))
    for n in selected:
        if (n not in by_result or by_result[n]["status"] not in {"update", "new_candidate"}
                or plan.get("eligible", {}).get(str(n)) != by_result[n]["status"]):
            raise ValueError(f"{n}행은 자동 적용 가능한 행이 아닙니다.")
    log.seek(0)
    last = {}
    for line in log:
        event = json.loads(line)
        last[event["key"]] = event

    def record(key, row, status, **extra):
        event = dict(key=key, row=row, status=status, **extra)
        log.write(json.dumps(event, ensure_ascii=False) + "\n")
        log.flush()
        os.fsync(log.fileno())
        last[key] = event

    for n in selected:
        result, source = by_result[n], by_row[n]
        key = fingerprint(["alumni-contact", mobile_key(source["phone"])])
        new = result["status"] == "new_candidate"
        if new and key in last:
            raise ValueError(f"{n}행의 이전 작업 기록이 있습니다. 재생성 전에 주소록과 기록을 대조하세요.")
        record(key, n, "create_pending" if new else "update_pending")
        raw = None if new else inventory[result["ids"][0]]
        try:
            resource = apply_one(api, source, raw, group, press, result["diff"])
        except (RuntimeError, ValueError, OSError) as error:
            raise ValueError(f"{n}행에서 중단했습니다. {error} 작업 기록과 새 미리보기를 확인하세요.") from None
        record(key, n, "verified", resource=resource)
        print(f"{n}행 반영·재조회 확인", flush=True)


def main():
    parser = argparse.ArgumentParser(description="동문회 Google 주소록 비교와 선택 적용")
    commands = parser.add_subparsers(dest="command", required=True)
    local = commands.add_parser("csv-preview", help="Google CSV 두 개를 로컬에서 비교")
    local.add_argument("--source-csv", required=True, type=Path)
    local.add_argument("--contacts-csv", required=True, type=Path)
    local.set_defaults(sheet_id=None)
    live = commands.add_parser("preview", help="동문회 계정으로 읽기 전용 API 비교")
    write = commands.add_parser("apply", help="현재 API 자료와 일치하는 계획에서 지정 행만 적용")
    for cmd in [local, live]:
        cmd.add_argument("--output", required=True, type=Path, help="새 비공개 검토 폴더")
    for cmd in [live, write]:
        cmd.add_argument("--client", required=True, type=Path, help="Google Desktop OAuth 클라이언트 JSON")
        cmd.add_argument("--sheet-id", required=True, help="원본 Google Sheets 문서 ID")
        cmd.add_argument("--state-dir", type=Path,
                         default=Path.home() / ".local/state/dgkma-alumni-contacts")
    write.add_argument("--plan", required=True, type=Path)
    write.add_argument("--rows", required=True, type=int, nargs="+", help="검토를 마친 원본 행 번호")
    args = parser.parse_args()
    os.umask(0o077)
    api = None
    if args.command != "csv-preview":
        from .google_api import GoogleStore
        args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        writing = args.command == "apply"
        token = args.state_dir / ("write-token.json" if writing else "read-token.json")
        api = GoogleStore(args.client, token, write=writing)
    if args.command == "apply":
        with (args.state_dir / "operations.jsonl").open("a+", encoding="utf-8") as log:
            try:
                fcntl.flock(log, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError("다른 동기화가 적용 중입니다.") from None
            apply(args, api, log)
    else:
        data = snapshot(args, api)
        review_folder(args.output, *data[:4], live=api is not None)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        sys.exit(str(error))
