#!/usr/bin/env python3
"""Extract the public fields used by a bugo.gipoom.com obituary page."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


API_ROOT = "https://api.smartnanumi.com/public/member/"
KST = ZoneInfo("Asia/Seoul")
WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Public bugo.gipoom.com obituary URL")
    return parser.parse_args()


def decode_public_id(encoded: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{24}", encoded):
        raise ValueError("기품 공개 링크 ID가 24자리 16진수가 아닙니다.")
    shifted = "".join(
        format((int(character, 16) - index % 16 + 16) % 16, "x")
        for index, character in enumerate(encoded)
    )
    return shifted[::-1]


def member_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname != "bugo.gipoom.com":
        raise ValueError("bugo.gipoom.com의 공개 부고 URL만 지원합니다.")
    path_parts = [part for part in parsed.path.split("/") if part]
    if len(path_parts) != 1:
        raise ValueError("기품 공개 부고 URL 경로를 확인할 수 없습니다.")
    return decode_public_id(path_parts[0])


def fetch_member(member_id: str) -> dict:
    request = urllib.request.Request(
        API_ROOT + member_id,
        headers={"Accept": "application/json", "User-Agent": "Codex-DGKMA-Obituary/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"기품 공개 API가 HTTP {response.status}를 반환했습니다.")
        return json.load(response)


def parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(KST)


def format_phone(value: str | None) -> str | None:
    if not value:
        return value
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return value


def select_fields(data: dict, source_url: str) -> dict:
    fevent = data.get("fevent") or {}
    deceased = fevent.get("deceasedInfo") or {}
    coffin_out = deceased.get("coffinOut") or {}
    date_value = parse_iso(coffin_out.get("date"))
    time_value = parse_iso(coffin_out.get("time"))
    funeral_home = ((fevent.get("funeralHome") or {}).get("info") or {})
    room = fevent.get("roomCurrent") or fevent.get("room") or {}

    return {
        "source": {
            "url": source_url,
            "provider": "기품",
            "updatedAt": fevent.get("updatedAt"),
        },
        "member": {
            "name": data.get("name"),
            "relationType": data.get("relationType"),
            "reverseType": data.get("reverseType"),
            "phoneNumberRaw": data.get("phoneNumber"),
            "phoneNumberDisplay": format_phone(data.get("phoneNumber")),
        },
        "deceased": {
            "name": deceased.get("name"),
            "age": deceased.get("age"),
        },
        "funeral": {
            "funeralHome": funeral_home.get("name"),
            "room": room.get("name"),
            "floor": room.get("nameDetail"),
            "coffinOutDate": date_value.date().isoformat() if date_value else None,
            "coffinOutWeekday": WEEKDAYS[date_value.weekday()] if date_value else None,
            "coffinOutTime": time_value.strftime("%H:%M") if time_value else None,
        },
        "contact": {
            "bank": data.get("bank"),
            "accountNumber": data.get("cashAccount"),
            "accountHolder": data.get("accountHolder"),
        },
    }


def main() -> int:
    args = parse_args()
    try:
        member_id = member_id_from_url(args.url)
        result = select_fields(fetch_member(member_id), args.url)
    except (ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
