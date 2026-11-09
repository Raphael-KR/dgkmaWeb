#!/usr/bin/env python3
"""Extract, normalize, render, and validate a DGKMA obituary."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
from pathlib import Path
from types import SimpleNamespace

from extract_gipoom import fetch_member, member_id_from_url, select_fields
from validate_obituary import validate


FORMAT_ALIASES = {
    "homepage": "homepage",
    "홈페이지": "homepage",
    "홈페이지용": "homepage",
    "홈페이지 게시판용": "homepage",
    "kakao": "kakao",
    "카톡": "kakao",
    "카톡용": "kakao",
    "단톡방": "kakao",
    "단톡방용": "kakao",
    "sms-short": "sms-short",
    "단문 문자": "sms-short",
    "단문 문자용": "sms-short",
    "sms-long": "sms-long",
    "문자용": "sms-long",
    "장문 문자": "sms-long",
    "장문 문자용": "sms-long",
}
WEEKDAYS_LONG = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
WEEKDAYS_SHORT = ["월", "화", "수", "목", "금", "토", "일"]


class RenderError(ValueError):
    """Raised when verified input is insufficient for deterministic rendering."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-url", help="Public bugo.gipoom.com obituary URL")
    source.add_argument("--data", type=Path, help="Extracted JSON path; use - for stdin")
    parser.add_argument("--format", default="homepage", help="Output format or Korean alias")
    parser.add_argument("--member-type", help="동문, 회원, 권리회원, or legacy 정회원")
    parser.add_argument("--graduation-class", help="Graduation class, such as 21 or 졸업21기")
    parser.add_argument("--admission-year", help="Admission year, such as 05 or 05학번")
    parser.add_argument("--title", help="Optional title supplied by the user")
    parser.add_argument("--band-url", help="BAND comment URL for Kakao and SMS")
    parser.add_argument("--member-name", help="Override extracted member name")
    parser.add_argument("--relation", help="Override extracted relation, such as 부친")
    parser.add_argument("--phone", help="Override extracted contact number")
    parser.add_argument("--contact-name", help="Override the contact label, such as 장남 김수영")
    parser.add_argument(
        "--response-mode",
        choices=("body", "final", "test"),
        default="body",
        help="body: plain text; final/test: ready-to-send Markdown code blocks",
    )
    return parser.parse_args()


def read_data(path: Path) -> dict:
    if str(path) == "-":
        return json.load(sys.stdin)
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def load_data(args: argparse.Namespace) -> tuple[dict, bool]:
    if args.source_url:
        member_id = member_id_from_url(args.source_url)
        return select_fields(fetch_member(member_id), args.source_url), True
    return read_data(args.data), False


def normalize_format(value: str) -> str:
    try:
        return FORMAT_ALIASES[value.strip()]
    except KeyError as exc:
        supported = ", ".join(sorted(FORMAT_ALIASES))
        raise RenderError(f"지원하지 않는 양식입니다: {value} (지원값: {supported})") from exc


def normalize_member_type(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if normalized == "정회원":
        return "회원"
    if normalized not in {"동문", "회원", "권리회원"}:
        raise RenderError("회원 유형은 동문, 회원, 권리회원 또는 정회원이어야 합니다.")
    return normalized


def normalize_graduation_class(value: str | None) -> str | None:
    if value is None:
        return None
    match = re.fullmatch(r"(?:졸업)?\s*(\d+)\s*기?", value.strip())
    if not match:
        raise RenderError("졸업기수는 21 또는 졸업21기처럼 입력하세요.")
    return match.group(1)


def normalize_admission_year(value: str | None) -> str | None:
    if value is None:
        return None
    match = re.fullmatch(r"(\d{2,4})\s*학번?", value.strip())
    if not match:
        match = re.fullmatch(r"(\d{2,4})", value.strip())
    if not match:
        raise RenderError("입학학번은 05 또는 05학번처럼 입력하세요.")
    return match.group(1)


def normalize_relation(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized[:-1] if normalized.endswith("상") else normalized


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return value
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return value.strip()


def require(values: dict[str, object], names: list[str]) -> None:
    missing = [name for name in names if values.get(name) in (None, "")]
    if missing:
        raise RenderError("필수 정보가 없습니다: " + ", ".join(missing))


def member_info(graduation_class: str | None, admission_year: str | None) -> str:
    if graduation_class and admission_year:
        return f"졸업{graduation_class}기({admission_year}학번)"
    if graduation_class:
        return f"졸업{graduation_class}기"
    if admission_year:
        return f"{admission_year}학번"
    raise RenderError("필수 정보가 없습니다: 졸업기수 또는 입학학번")


def funeral_place(funeral: dict) -> str | None:
    parts = [value.strip() for value in (funeral.get("funeralHome"), funeral.get("room")) if value]
    if not parts:
        return None
    result = " ".join(parts)
    if funeral.get("floor"):
        result += f"({str(funeral['floor']).strip()})"
    return result


def parse_date(value: str | None, label: str = "날짜") -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise RenderError(f"{label}가 YYYY-MM-DD 형식이 아닙니다: {value}") from exc


def format_time(value: str | None) -> str:
    if not value:
        return ""
    try:
        parsed = dt.time.fromisoformat(value)
    except ValueError as exc:
        raise RenderError(f"발인 시각이 HH:MM 형식이 아닙니다: {value}") from exc
    period = "오전" if parsed.hour < 12 else "오후"
    hour = parsed.hour % 12 or 12
    minute = f" {parsed.minute}분" if parsed.minute else ""
    return f"{period} {hour}시{minute}"


def date_text(date_value: dt.date, time_value: str | None, format_name: str) -> str:
    time_text = format_time(time_value)
    suffix = f" {time_text}" if time_text else ""
    if format_name == "kakao":
        weekday = WEEKDAYS_SHORT[date_value.weekday()]
        return f"{date_value.month}월 {date_value.day}일({weekday}){suffix}"
    weekday = WEEKDAYS_LONG[date_value.weekday()]
    return f"{date_value.year}년 {date_value.month}월 {date_value.day}일({weekday}){suffix}"


def render(data: dict, args: argparse.Namespace) -> tuple[str, str, str | None, int | None]:
    format_name = normalize_format(args.format)
    member = data.get("member") or {}
    deceased = data.get("deceased") or {}
    funeral = data.get("funeral") or {}
    contact = data.get("contact") or {}
    source = data.get("source") or {}

    values = {
        "회원명": args.member_name or member.get("name"),
        "회원 유형": normalize_member_type(args.member_type),
        "관계": normalize_relation(args.relation or member.get("reverseType")),
        "고인명": deceased.get("name"),
        "향년": deceased.get("age"),
        "별세 날짜": parse_date(deceased.get("deathDate"), "별세 날짜"),
        "빈소": funeral_place(funeral),
        "장지": funeral.get("cemetery") or funeral.get("burialPlace"),
        "조문 사양": funeral.get("visitationDeclined") is True,
        "발인 날짜": parse_date(funeral.get("coffinOutDate"), "발인 날짜"),
        "연락처": normalize_phone(
            args.phone
            or contact.get("phoneNumberDisplay")
            or contact.get("phoneNumberRaw")
            or member.get("phoneNumberDisplay")
            or member.get("phoneNumberRaw")
        ),
    }
    graduation_class = normalize_graduation_class(args.graduation_class)
    admission_year = normalize_admission_year(args.admission_year)
    require(values, ["회원명", "관계"])
    info = member_info(graduation_class, admission_year)

    if format_name != "sms-short":
        require(
            values,
            ["회원 유형", "고인명", "향년", "빈소", "발인 날짜", "연락처"],
        )

    relation = values["관계"]
    first_line = "#부고 #동문본인상" if relation == "본인" else "#부고"
    title_suffix = f"({args.title.strip()})" if args.title else ""
    heading = (
        f"본회 {info} {values['회원명']} {values['회원 유형']}{title_suffix} {relation}상"
    )
    short_heading = f"{info} {values['회원명']} {relation}상"
    original_url = source.get("url")
    selected_url = original_url if format_name == "homepage" else (args.band_url or original_url)
    account_values = [contact.get("bank"), contact.get("accountNumber"), contact.get("accountHolder")]
    account_line = None
    if all(account_values):
        account_line = " ".join(str(value).strip() for value in account_values)

    if format_name == "sms-short":
        lines = [first_line, short_heading]
        if selected_url:
            lines.append(selected_url)
        lines.append("#동국한의동문회")
        return "\n".join(lines), format_name, selected_url, None

    date_value = values["발인 날짜"]
    date_line = date_text(date_value, funeral.get("coffinOutTime"), format_name)
    deceased_line = f"故{values['고인명']} (향년 {values['향년']}세)"
    contact_name = args.contact_name or contact.get("contactName") or values["회원명"]

    if format_name == "homepage":
        funeral_lines = [f"- 고인: {deceased_line}"]
        if values["별세 날짜"]:
            funeral_lines.append(
                f"- 별세: {date_text(values['별세 날짜'], None, 'homepage')}"
            )
        funeral_lines.append(f"- 빈소: {values['빈소']}")
        if values["장지"]:
            funeral_lines.append(f"- 장지: {str(values['장지']).strip()}")
        funeral_lines.append(f"- 발인: {date_line}")
        blocks = [
            f"{first_line}\n{heading}",
            "\n".join(funeral_lines),
        ]
        contact_lines = [f"- 연락처: {contact_name} {values['연락처']}"]
        if account_line:
            contact_lines.append(f"- 마음 전하실 곳: {account_line}")
        blocks.append("\n".join(contact_lines))
        notice_lines = []
        if values["조문 사양"]:
            notice_lines.append("* 유가족의 뜻에 따라 조문은 정중히 사양합니다.")
        if original_url:
            notice_lines.append(f"* 유가족 및 장례식장 위치 확인: {original_url}")
        if notice_lines:
            blocks.append("\n".join(notice_lines))
        blocks.append("삼가 고인의 명복을 빕니다.\n-동국대학교 한의과대학 동문회-")
        text = "\n\n".join(blocks)
    elif format_name == "kakao":
        mention_key = f"{graduation_class}기" if graduation_class else f"{admission_year}학번"
        blocks = [
            f"{first_line}\n{heading}",
            f"발인: {date_line}\n빈소: {values['빈소']}",
        ]
        contact_lines = []
        if account_line:
            contact_lines.append(f"마음 전하실 곳: {account_line}")
        contact_lines.append(
            f"문의: {contact_name} {values['연락처']} "
            f"@동국한의{mention_key} {values['회원명']} {values['회원 유형']}"
        )
        blocks.append("\n".join(contact_lines))
        if selected_url:
            blocks.extend(
                [
                    f"조의 표명은 여기 댓글로\n👉 {selected_url}",
                    "조의는 톡에 쓰지 말아주세요 🙏",
                ]
            )
        text = "\n\n".join(blocks)
    else:
        blocks = [
            f"{first_line}\n{heading}",
            f"- 고인: {deceased_line}\n- 빈소: {values['빈소']}\n- 발인: {date_line}",
        ]
        contact_lines = [f"- 연락처: {contact_name} {values['연락처']}"]
        if account_line:
            contact_lines.append(f"- 마음 전하실 곳: {account_line}")
        blocks.append("\n".join(contact_lines))
        if selected_url:
            blocks.append(f"* 온라인 조문: {selected_url}")
        blocks.append("삼가 고인의 명복을 빕니다.\n-동국대학교한의과대학동문회-")
        text = "\n\n".join(blocks)

    year = date_value.year
    return text, format_name, selected_url, year


def ready_response(text: str, format_name: str, extracted: bool, mode: str) -> str:
    if mode == "body":
        return text
    result = f"```text\n{text}\n```"
    if mode == "test":
        extraction_label = "자동 추출" if extracted else "구조화 입력"
        result += (
            "\n\n```text\n"
            "테스트 결과: 통과\n"
            f"- {extraction_label}: 통과\n"
            "- 필수 정보 및 형식: 통과\n"
            "- 날짜·요일·시간대: 통과\n"
            "- 링크 선택: 통과\n"
            "```"
        )
    return result


def main() -> int:
    args = parse_args()
    try:
        data, extracted = load_data(args)
        text, format_name, selected_url, year = render(data, args)
        validation_args = SimpleNamespace(
            format_name=format_name,
            year=year,
            expected_link=selected_url,
            expected_band_link=(
                args.band_url if args.band_url and format_name != "homepage" else None
            ),
            expected_death_date=(
                data.get("deceased", {}).get("deathDate")
                if format_name == "homepage"
                else None
            ),
            expected_cemetery=(
                (data.get("funeral", {}).get("cemetery") or data.get("funeral", {}).get("burialPlace"))
                if format_name == "homepage"
                else None
            ),
            expect_visitation_declined=(
                data.get("funeral", {}).get("visitationDeclined") is True
                and format_name == "homepage"
            ),
        )
        errors, warnings = validate(text, validation_args)
        if errors:
            raise RenderError("내부 검증 실패: " + " / ".join(errors))
    except (
        RenderError,
        ValueError,
        OSError,
        urllib.error.URLError,
        json.JSONDecodeError,
    ) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(ready_response(text, format_name, extracted, args.response_mode))
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
