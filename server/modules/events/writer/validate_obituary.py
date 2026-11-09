#!/usr/bin/env python3
"""Validate a DGKMA obituary draft without storing its contents."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path


WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]
DATE_RE = re.compile(
    r"(?:(?P<year>\d{4})년\s*)?(?P<month>\d{1,2})월\s*"
    r"(?P<day>\d{1,2})일\((?P<weekday>[월화수목금토일])(?P<suffix>요일)?\)"
)
URL_RE = re.compile(r"https?://[^\s]+")
REQUIRED_PREFIXES = {
    "homepage": ["- 고인:", "- 빈소:", "- 발인:", "- 연락처:"],
    "kakao": ["발인:", "빈소:", "문의:"],
    "sms-short": [],
    "sms-long": ["- 고인:", "- 빈소:", "- 발인:", "- 연락처:"],
}
MEMBER_TYPE_RE = r"(?:권리회원|회원|동문)"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--format",
        required=True,
        choices=sorted(REQUIRED_PREFIXES),
        dest="format_name",
    )
    parser.add_argument("--year", type=int, help="Year for formats that omit it")
    parser.add_argument("--expected-link")
    parser.add_argument("--expected-band-link")
    parser.add_argument("--expected-death-date")
    parser.add_argument("--expected-cemetery")
    parser.add_argument("--expect-visitation-declined", action="store_true")
    parser.add_argument("path", nargs="?", type=Path)
    return parser.parse_args()


def read_text(path: Path | None) -> str:
    return path.read_text(encoding="utf-8") if path else sys.stdin.read()


def find_line(lines: list[str], prefix: str) -> str | None:
    return next((line for line in lines if line.startswith(prefix)), None)


def find_line_index(lines: list[str], prefix: str) -> int | None:
    return next((index for index, line in enumerate(lines) if line.startswith(prefix)), None)


def require_blank_after(
    lines: list[str], index: int | None, label: str, errors: list[str]
) -> None:
    if index is not None and (index + 1 >= len(lines) or lines[index + 1] != ""):
        errors.append(f"{label} 다음에 빈 줄이 필요합니다.")


def validate(text: str, args: argparse.Namespace) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    content = text.strip()
    lines = [line.rstrip() for line in content.splitlines()]

    if not content:
        return ["본문이 비어 있습니다."], warnings
    if "```" in content:
        errors.append("검증 입력에는 Markdown 코드블록 표식을 넣지 마세요.")
    if re.search(r"\[[^\]]+\]\(https?://[^)]+\)", content):
        errors.append("링크를 Markdown 링크가 아닌 URL 원문으로 쓰세요.")
    if re.search(r"\{[^{}\n]+\}", content):
        errors.append("치환되지 않은 자리표시자가 있습니다.")
    if "정회원" in content:
        errors.append("정회원 대신 회원을 사용하세요.")
    if not lines[0].startswith("#부고"):
        errors.append("첫 줄은 #부고로 시작해야 합니다.")

    if args.format_name == "sms-short":
        if "#동국한의동문회" not in lines:
            errors.append("단문 문자에는 #동국한의동문회가 필요합니다.")
        if len(lines) < 3:
            errors.append("단문 문자 본문이 너무 짧습니다.")
        if len(lines) >= 2 and not lines[1].endswith("상"):
            errors.append("단문 문자의 회원 제목은 관계상으로 끝나야 합니다.")
    else:
        if len(lines) < 2 or not lines[1].startswith("본회 "):
            errors.append("둘째 줄은 '본회 '로 시작하는 회원 제목이어야 합니다.")
        elif not lines[1].endswith("상"):
            errors.append("회원 제목은 관계상으로 끝나야 합니다.")
        elif not re.search(rf" {MEMBER_TYPE_RE}(?:\([^()\n]+\))? .+상$", lines[1]):
            errors.append("회원 제목에는 동문, 회원 또는 권리회원 유형이 필요합니다.")
        for prefix in REQUIRED_PREFIXES[args.format_name]:
            if find_line(lines, prefix) is None:
                errors.append(f"필수 줄이 없습니다: {prefix}")

    if args.format_name in {"homepage", "sms-long"}:
        deceased_line = find_line(lines, "- 고인:")
        if deceased_line and not re.search(r"- 고인: 故.+ \(향년 \d+세\)$", deceased_line):
            errors.append("고인 줄은 '故성명 (향년 00세)' 형식이어야 합니다.")

    if args.format_name in {"homepage", "sms-long"}:
        if "삼가 고인의 명복을 빕니다." not in lines:
            errors.append("조의 문구가 없습니다.")
        expected_signature = (
            "-동국대학교 한의과대학 동문회-"
            if args.format_name == "homepage"
            else "-동국대학교한의과대학동문회-"
        )
        if expected_signature not in lines:
            errors.append("동문회 서명이 없습니다.")

    if args.format_name == "homepage":
        expected_death_date = getattr(args, "expected_death_date", None)
        if expected_death_date:
            try:
                death_date = dt.date.fromisoformat(expected_death_date)
            except ValueError:
                errors.append("기대 별세일은 YYYY-MM-DD 형식이어야 합니다.")
            else:
                expected_line = (
                    f"- 별세: {death_date.year}년 {death_date.month}월 {death_date.day}일"
                    f"({WEEKDAYS[death_date.weekday()]}요일)"
                )
                if find_line(lines, "- 별세:") != expected_line:
                    errors.append("확인된 별세일이 홈페이지 문안에 정확히 반영되지 않았습니다.")

        expected_cemetery = getattr(args, "expected_cemetery", None)
        if expected_cemetery and find_line(lines, "- 장지:") != f"- 장지: {expected_cemetery.strip()}":
            errors.append("확인된 장지가 홈페이지 문안에 정확히 반영되지 않았습니다.")

        if getattr(args, "expect_visitation_declined", False):
            notice = "* 유가족의 뜻에 따라 조문은 정중히 사양합니다."
            if notice not in lines:
                errors.append("확인된 조문 사양 안내가 홈페이지 문안에 없습니다.")

    date_matches = list(DATE_RE.finditer(content))
    if args.format_name != "sms-short" and not date_matches:
        errors.append("검증 가능한 발인 날짜와 요일이 없습니다.")
    for match in date_matches:
        year = int(match.group("year")) if match.group("year") else args.year
        if year is None:
            warnings.append("연도가 없어 날짜·요일 일치를 검증하지 못했습니다.")
            continue
        try:
            date_value = dt.date(year, int(match.group("month")), int(match.group("day")))
        except ValueError as exc:
            errors.append(f"유효하지 않은 날짜입니다: {exc}")
            continue
        actual = WEEKDAYS[date_value.weekday()]
        if actual != match.group("weekday"):
            errors.append(
                f"요일이 일치하지 않습니다: {date_value.isoformat()}은 {actual}요일입니다."
            )
        if args.format_name == "kakao" and match.group("suffix"):
            errors.append("카톡용 요일은 '(월)'처럼 한 글자로 쓰세요.")
        if args.format_name in {"homepage", "sms-long"} and not match.group("suffix"):
            errors.append("홈페이지·장문 문자 요일은 '(월요일)'처럼 쓰세요.")

    contact_prefix = "문의:" if args.format_name == "kakao" else "- 연락처:"
    contact_line = find_line(lines, contact_prefix)
    if contact_line:
        compact_phone = re.search(r"010[\d -]{8,}", contact_line)
        if compact_phone:
            digits = re.sub(r"\D", "", compact_phone.group())
            if len(digits) == 11 and not re.search(r"010-\d{4}-\d{4}", contact_line):
                errors.append("11자리 010 번호는 010-0000-0000 형식으로 쓰세요.")

    if args.expected_link and args.expected_link not in content:
        errors.append("기대하는 게시용 링크가 없습니다.")
    elif args.expected_link:
        expected_prefix = {
            "homepage": "* 유가족 및 장례식장 위치 확인:",
            "sms-long": "* 온라인 조문:",
        }.get(args.format_name)
        if expected_prefix and args.expected_link not in (find_line(lines, expected_prefix) or ""):
            errors.append("게시용 링크가 지정된 안내 줄에 있지 않습니다.")
    if args.expected_band_link:
        if args.format_name == "homepage":
            warnings.append("홈페이지용에서는 BAND 링크 기대값을 검사하지 않습니다.")
        elif args.expected_band_link not in content:
            errors.append("카톡·문자용에 기대하는 BAND 링크가 없습니다.")
        else:
            other_urls = [url for url in URL_RE.findall(content) if url != args.expected_band_link]
            if other_urls:
                errors.append("BAND 링크가 있는데 다른 링크도 함께 출력되었습니다.")

    if args.format_name == "kakao" and URL_RE.search(content):
        required_comment_lines = {
            "조의 표명은 여기 댓글로",
            "조의는 톡에 쓰지 말아주세요 🙏",
        }
        missing = sorted(required_comment_lines.difference(lines))
        if missing:
            errors.append("카톡 링크 안내 문구가 완전하지 않습니다.")
        if not any(line.startswith("👉 http") for line in lines):
            errors.append("카톡 링크는 화살표와 URL 원문으로 표시해야 합니다.")

    if args.format_name == "homepage":
        ordered_prefixes = ["- 고인:", "- 별세:", "- 빈소:", "- 장지:", "- 발인:"]
        present_indexes = [
            find_line_index(lines, prefix)
            for prefix in ordered_prefixes
            if find_line_index(lines, prefix) is not None
        ]
        if present_indexes != sorted(present_indexes):
            errors.append("홈페이지의 고인·별세·빈소·장지·발인 순서가 올바르지 않습니다.")
        require_blank_after(lines, 1, "회원 제목", errors)
        require_blank_after(lines, find_line_index(lines, "- 발인:"), "발인 줄", errors)
        contact_end = find_line_index(lines, "- 마음 전하실 곳:")
        if contact_end is None:
            contact_end = find_line_index(lines, "- 연락처:")
        require_blank_after(lines, contact_end, "연락처 블록", errors)
        link_index = find_line_index(lines, "* 유가족 및 장례식장 위치 확인:")
        require_blank_after(lines, link_index, "원부고 링크", errors)

    if args.format_name == "sms-long":
        require_blank_after(lines, 1, "회원 제목", errors)
        require_blank_after(lines, find_line_index(lines, "- 발인:"), "발인 줄", errors)
        contact_end = find_line_index(lines, "- 마음 전하실 곳:")
        if contact_end is None:
            contact_end = find_line_index(lines, "- 연락처:")
        require_blank_after(lines, contact_end, "연락처 블록", errors)
        link_index = find_line_index(lines, "* 온라인 조문:")
        require_blank_after(lines, link_index, "온라인 조문 링크", errors)

    if args.format_name == "kakao":
        require_blank_after(lines, 1, "회원 제목", errors)
        require_blank_after(lines, find_line_index(lines, "빈소:"), "빈소 줄", errors)
        inquiry_index = find_line_index(lines, "문의:")
        inquiry_line = lines[inquiry_index] if inquiry_index is not None else ""
        if not re.search(rf" @동국한의\S+ .+ {MEMBER_TYPE_RE}$", inquiry_line):
            errors.append("문의 줄에는 '@동국한의… 동문/회원/권리회원' 멘션이 필요합니다.")
        if URL_RE.search(content):
            require_blank_after(lines, inquiry_index, "문의 줄", errors)
            arrow_index = find_line_index(lines, "👉 http")
            require_blank_after(lines, arrow_index, "BAND 링크", errors)

    return errors, warnings


def main() -> int:
    args = parse_args()
    errors, warnings = validate(read_text(args.path), args)
    if errors:
        print("FAIL")
        for error in errors:
            print(f"- {error}")
        for warning in warnings:
            print(f"- 경고: {warning}")
        return 1

    print(f"PASS: {args.format_name}")
    for warning in warnings:
        print(f"- 경고: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
