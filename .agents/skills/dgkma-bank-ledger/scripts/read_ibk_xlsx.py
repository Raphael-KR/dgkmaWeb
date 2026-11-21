#!/usr/bin/env python3
"""Read the cells of an IBK XLSX export without loading its Excel styles."""

import argparse
import json
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile


def read_text(element):
    if element is None:
        return ""
    # A string is either plain text or a sequence of rich-text runs.
    parts = element.findall("{*}t") + element.findall("{*}r/{*}t")
    return "".join(part.text or "" for part in parts)


def workbook_parts(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    paths = {}
    shared = None
    for rel in rels:
        if rel.get("TargetMode") == "External":
            continue
        target = rel.attrib["Target"]
        path = posixpath.normpath(posixpath.join("xl", target)).lstrip("/")
        if rel.attrib["Type"].endswith("/worksheet"):
            paths[rel.attrib["Id"]] = path
        elif rel.attrib["Type"].endswith("/sharedStrings"):
            shared = path
    sheets = {}
    for sheet in workbook.findall("{*}sheets/{*}sheet"):
        rel_id = next((v for k, v in sheet.attrib.items() if k.endswith("}id")), None)
        if rel_id in paths:
            sheets[sheet.attrib["name"]] = paths[rel_id]
    if not sheets:
        raise ValueError("워크시트를 찾지 못했습니다.")
    return sheets, shared


def column_number(reference):
    match = re.fullmatch(r"([A-Z]{1,3})[1-9][0-9]*", reference)
    if not match:
        raise ValueError("셀 주소를 확인하세요.")
    number = 0
    for letter in match[1]:
        number = number * 26 + ord(letter) - ord("A") + 1
    if number > 16384:
        raise ValueError("워크시트 범위를 벗어난 열입니다.")
    return number


def cell_value(cell, strings):
    if cell.find("{*}f") is not None:
        raise ValueError("수식이 포함되어 있습니다. 은행 원본 내보내기를 확인하세요.")
    kind = cell.get("t", "n")
    raw = cell.findtext("{*}v")
    if kind == "inlineStr":
        return read_text(cell.find("{*}is"))
    if kind == "s":
        if raw is None or not raw.isdecimal() or int(raw) >= len(strings):
            raise ValueError("문자열 인덱스가 잘못되었습니다.")
        return strings[int(raw)]
    if kind not in {"n", "str", "d", "b"}:
        raise ValueError("지원하지 않는 셀 유형입니다. 은행 원본을 확인하세요.")
    return raw or None


def inspect(path, sheet_name, include_rows):
    with ZipFile(path) as archive:
        sheets, shared = workbook_parts(archive)
        if sheet_name is not None and sheet_name not in sheets:
            raise ValueError("지정한 시트가 없습니다.")
        if include_rows and sheet_name is None and len(sheets) != 1:
            raise ValueError("--sheet로 읽을 시트를 지정하세요.")
        selected = {sheet_name: sheets[sheet_name]} if sheet_name is not None else sheets
        strings = []
        if include_rows and shared:
            strings = [read_text(si) for si in ET.fromstring(archive.read(shared)).findall("{*}si")]
        summaries = []
        for name, part in selected.items():
            xml = ET.fromstring(archive.read(part))
            data = xml.find("{*}sheetData")
            if data is None:
                raise ValueError("워크시트 데이터가 없습니다.")
            rows = []
            width = 0
            for row in data.findall("{*}row"):
                cells = row.findall("{*}c")
                indices = [column_number(cell.attrib["r"]) for cell in cells]
                width = max(width, max(indices, default=0))
                if include_rows:
                    values = [None] * max(indices, default=0)
                    for cell, index in zip(cells, indices):
                        values[index - 1] = cell_value(cell, strings)
                    rows.append({"row": int(row.attrib["r"]), "values": values})
            if include_rows:
                for row in rows:
                    row["values"].extend([None] * (width - len(row["values"])))
                return {"sheet": name, "rows": rows}
            summaries.append({"sheet": name, "row_count": len(data.findall("{*}row")), "column_count": width})
        return {"sheets": summaries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file")
    parser.add_argument("--sheet", help="워크시트 이름")
    parser.add_argument("--rows", action="store_true",
                        help="민감한 원본 셀이 포함된 JSON을 표준출력으로 내보냅니다.")
    args = parser.parse_args()
    try:
        result = inspect(args.file, args.sheet, args.rows)
    except (OSError, BadZipFile, ET.ParseError, KeyError, ValueError, RuntimeError) as exc:
        parser.exit(1, f"XLSX 읽기 실패: {exc}\n")
    json.dump(result, sys.stdout, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
