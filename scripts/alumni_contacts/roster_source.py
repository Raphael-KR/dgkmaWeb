"""Read the UUID roster and the Google Contacts projection in one Sheets response."""
from pathlib import Path
from uuid import UUID

from .compare import mobile_key
from .formats import source_rows
from .google_api import GoogleStore, TAB, TAB_ID, _call


DOC = "1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw"
MASTER_ID = 876761083
MASTER_HEADERS = ["alumni_uid", "학과", "기수", "성명", "입학일자", "졸업일자", "핸드폰번호", "그룹", "상태", "동문회직책", "메모"]


def account(write=False):
    client = Path.home() / ".config/dgkma-alumni-contacts/desktop-client.json"
    token_dir = Path.home() / ".local/state/dgkma-alumni-contacts"
    token = token_dir / ("write-token.json" if write else "read-token.json")
    if not token.is_file():
        raise ValueError("동문회 계정의 저장된 OAuth 연결이 필요합니다.")
    return GoogleStore(client, token, write=write)


def read_roster(api):
    api._authorized()
    result = _call("명부와 주소록 양식 조회", api._service("sheets", "v4").spreadsheets().get(
        spreadsheetId=DOC, ranges=["'통합주소록'!A:K", f"'{TAB}'!A:G"],
        fields="spreadsheetId,sheets(properties(sheetId,title),data(rowData(values(formattedValue,effectiveValue(errorValue(type))))))",
    ))
    if result.get("spreadsheetId") != DOC:
        raise ValueError("명부 문서 ID가 다릅니다.")
    tables = {}
    for sheet in result["sheets"]:
        prop = sheet["properties"]
        data = []
        for block in sheet.get("data", []):
            for line in block.get("rowData", []):
                cells = line.get("values", [])
                if any("errorValue" in cell.get("effectiveValue", {}) for cell in cells):
                    raise ValueError(f"{prop['title']} {len(data) + 1}행에 수식 오류가 있습니다.")
                data.append([str(c.get("formattedValue", "")) for c in cells])
        tables[(prop["sheetId"], prop["title"])] = data
    master = tables[(MASTER_ID, "통합주소록")]
    rows = source_rows(tables[(TAB_ID, TAB)])
    if master[0] != MASTER_HEADERS:
        raise ValueError("통합주소록 A:K의 헤더가 변경됐습니다.")
    by_phone = {}
    uuids = set()
    for num, raw in enumerate(master[1:], 2):
        if not any(raw):
            continue
        line = raw + [""] * (11 - len(raw))
        uid = line[0].strip()
        parsed = UUID(uid)
        phone = mobile_key(line[6])
        if parsed.version != 4 or str(parsed) != uid or uid in uuids or not phone or phone in by_phone:
            raise ValueError(f"통합주소록 {num}행의 UUID 또는 휴대전화 키가 고유하지 않거나 잘못되었습니다.")
        uuids.add(uid)
        by_phone[phone] = line
    for r in rows:
        raw = by_phone.pop(mobile_key(r["phone"]), None)
        if not raw or (r["first"], r["org"], r["title"]) != (raw[3], raw[7], raw[9]):
            raise ValueError(f"주소록 양식 {r['row']}행이 원본과 다릅니다.")
        r["uid"] = raw[0]
        r["cohort"] = raw[2]
    if by_phone:
        raise ValueError("주소록 양식에 대응하지 않는 통합주소록 행이 있습니다.")
    return rows
