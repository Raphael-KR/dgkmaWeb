"""Google Desktop OAuth and the alumni directory's Sheets and People API access."""

import json
import os
import re
import stat
import tempfile
from pathlib import Path

from .formats import CURRENT_LABEL, IMPORT_NAMES, PRESS_LABEL, SOURCE_HEADER, TARGET_NAMES

ACCOUNT = "alumni.dkom@gmail.com"
TAB = "구글주소록양식"
TAB_ID = 1915755720
PERSON_FIELDS = "metadata,names,phoneNumbers,organizations,memberships,userDefined"
CONTACTS = "https://www.googleapis.com/auth/contacts"
SHEETS = "https://www.googleapis.com/auth/spreadsheets.readonly"
EMAIL = "https://www.googleapis.com/auth/userinfo.email"
CONTACT_SOURCE = ["READ_SOURCE_TYPE_CONTACT"]


class GoogleApiError(RuntimeError):
    """An operator-facing error without raw API responses, contact data or tokens."""


def _private_json(path):
    try:
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "r") as handle:
            mode = os.fstat(handle.fileno())
            if (not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid()
                    or mode.st_mode & 0o077):
                raise GoogleApiError("OAuth 파일은 현재 사용자 소유의 일반 파일이며 권한은 0600이어야 합니다.")
            data = json.load(handle)
    except (OSError, ValueError):
        raise GoogleApiError("지정한 OAuth 파일을 읽을 수 없습니다.") from None
    if not isinstance(data, dict):
        raise GoogleApiError("OAuth 파일 형식을 확인하세요.")
    return data


def _call(label, request):
    try:
        return request.execute(num_retries=0)
    except Exception as exc:
        status = getattr(getattr(exc, "resp", None), "status", None)
        if not isinstance(status, int):
            raise GoogleApiError(f"{label} 요청을 완료하지 못했습니다.") from None
        raise GoogleApiError(f"{label} 요청 실패 (HTTP {status}).") from None


def _scopes_match(scopes, required):
    if isinstance(scopes, str):
        scopes = scopes.split()
    if not isinstance(scopes, (list, tuple, set)):
        return False
    normalized = {EMAIL if item == "email" else item for item in scopes}
    return normalized == set(required)


def _groups_on(person):
    return {
        member.get("contactGroupMembership", {}).get("contactGroupResourceName")
        for member in person.get("memberships", [])
    }


class GoogleStore:
    """Pass separate token paths for read and write. Authentication is lazy."""

    def __init__(self, client_path, token_path, write=False):
        self.client_path = Path(client_path).expanduser().absolute()
        self.token_path = Path(token_path).expanduser().absolute()
        if self.client_path.resolve() == self.token_path.resolve():
            raise GoogleApiError("OAuth 클라이언트와 토큰에 서로 다른 경로를 지정하세요.")
        self.write = write
        self.scopes = ["openid", EMAIL, SHEETS, CONTACTS if write else CONTACTS + ".readonly"]
        self.creds = None
        self._verified_token = None
        self._services = {}
        self._group_ids = None

    def _initialize(self):
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError:
            raise GoogleApiError("requirements.txt의 Google OAuth 및 API 라이브러리를 설치하세요.") from None
        config = _private_json(self.client_path)
        installed = config.get("installed", {})
        if (not isinstance(installed, dict) or not installed.get("client_id")
                or not installed.get("client_secret")
                or installed.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth"
                or installed.get("token_uri") != "https://oauth2.googleapis.com/token"):
            raise GoogleApiError("Google에서 발급한 Desktop app 클라이언트 JSON을 지정하세요.")
        self.token_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        folder = self.token_path.parent.stat()
        if folder.st_uid != os.getuid() or folder.st_mode & 0o022:
            raise GoogleApiError("토큰 폴더는 현재 사용자가 소유하고 다른 사용자가 쓸 수 없어야 합니다.")
        try:
            if os.path.lexists(self.token_path):
                saved = _private_json(self.token_path)
                if (saved.get("client_id") != installed["client_id"]
                        or not _scopes_match(saved.get("scopes"), self.scopes)):
                    raise GoogleApiError("OAuth 클라이언트 또는 권한이 다릅니다. 모드별로 별도 토큰 경로를 지정하세요.")
                self.creds = Credentials.from_authorized_user_info(saved, self.scopes)
            else:
                flow = InstalledAppFlow.from_client_config(
                    config, self.scopes, autogenerate_code_verifier=True
                )
                self.creds = flow.run_local_server(
                    host="127.0.0.1", port=0, open_browser=True, timeout_seconds=1800,
                    login_hint=ACCOUNT, prompt="consent select_account",
                    authorization_prompt_message=None,
                    success_message="Authorization received. You may close this window.",
                )
        except GoogleApiError:
            raise
        except Exception as exc:
            raise GoogleApiError(f"Google Desktop OAuth 인증에 실패했습니다 ({type(exc).__name__}). "
                                 "클라이언트, 계정 및 동의 창의 상태를 확인하세요.") from None

    def _service(self, name, version):
        if name not in self._services:
            from googleapiclient.discovery import build

            self._services[name] = build(
                name, version, credentials=self.creds, static_discovery=True
            )
        return self._services[name]

    def _save_token(self):
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", dir=self.token_path.parent, prefix=".oauth-", delete=False
            ) as handle:
                temp_path = handle.name
                handle.write(self.creds.to_json())
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, self.token_path)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)

    def _authorized(self):
        try:
            if self.creds is None:
                self._initialize()
            if not self.creds.valid:
                from google.auth.transport.requests import Request

                self.creds.refresh(Request())
            granted = self.creds.granted_scopes
            if granted is not None and not _scopes_match(granted, self.scopes):
                raise GoogleApiError("Google이 허용한 권한이 요청한 실행 모드와 다릅니다.")
            if self.creds.token != self._verified_token:
                info = _call("Google 계정 확인", self._service("oauth2", "v2").userinfo().get())
                if (info.get("verified_email") is not True
                        or str(info.get("email", "")).casefold() != ACCOUNT):
                    raise GoogleApiError("인증된 계정이 동문회 계정과 다릅니다.")
                self._save_token()
                self._verified_token = self.creds.token
        except GoogleApiError:
            raise
        except Exception:
            raise GoogleApiError("Google 인증과 로컬 토큰 저장 상태를 확인하세요.") from None

    def source_rows(self, spreadsheet_id):
        """Return header followed by A:G rows from the verified contact export tab."""
        if not re.fullmatch(r"[A-Za-z0-9_-]+", spreadsheet_id or ""):
            raise GoogleApiError("원본 스프레드시트 ID를 확인하세요.")
        self._authorized()
        result = _call("명부 조회", self._service("sheets", "v4").spreadsheets().get(
            spreadsheetId=spreadsheet_id, ranges=[f"'{TAB}'!A1:G"],
            fields=("spreadsheetId,sheets(properties(sheetId,title),"
                    "data(rowData(values(formattedValue,effectiveValue(errorValue(type))))))"),
        ))
        sheets = result.get("sheets", [])
        if (result.get("spreadsheetId") != spreadsheet_id or len(sheets) != 1
                or sheets[0].get("properties", {}).get("sheetId") != TAB_ID
                or sheets[0]["properties"].get("title") != TAB):
            raise GoogleApiError("지정한 원본 문서와 구글주소록양식 탭 ID를 확인하세요.")
        rows = []
        for block in sheets[0].get("data", []):
            for row in block.get("rowData", []):
                values = row.get("values", [])
                if any("errorValue" in cell.get("effectiveValue", {}) for cell in values):
                    raise GoogleApiError(f"명부 {len(rows) + 1}행의 수식 오류를 먼저 확인하세요.")
                cells = [cell.get("formattedValue", "") for cell in values]
                rows.append(cells + [""] * (len(SOURCE_HEADER) - len(cells)))
        if not rows or rows[0] != SOURCE_HEADER:
            raise GoogleApiError("구글주소록양식 탭의 A:G 헤더가 관리 양식과 다릅니다.")
        return rows

    def _pages(self, label, method, **kwargs):
        token = None
        seen = set()
        while True:
            result = _call(label, method(**kwargs, pageToken=token))
            yield result
            token = result.get("nextPageToken")
            if not token:
                return
            if token in seen:
                raise GoogleApiError(f"{label} 응답에 반복된 페이지가 있습니다.")
            seen.add(token)

    def _target_groups(self):
        groups = self._service("people", "v1").contactGroups()
        targets, press = [], []
        for page in self._pages(
            "라벨 조회", groups.list, pageSize=1000, groupFields="groupType,name,memberCount"
        ):
            for group in page.get("contactGroups", []):
                label = group.get("name", "")
                if group.get("groupType") == "USER_CONTACT_GROUP":
                    if label in TARGET_NAMES:
                        targets.append(group)
                    elif label == PRESS_LABEL:
                        press.append(group)
        if len(targets) != 1 or len(press) != 1:
            raise GoogleApiError("동문회 대상 라벨과 신문사 라벨을 각각 하나씩 식별해야 합니다.")
        return targets[0], press[0]

    def inventory(self):
        """Return (all saved CONTACT persons, import group ID, press group ID)."""
        self._authorized()
        imported, press = self._target_groups()
        people = []
        seen = set()
        expected = None
        connection = self._service("people", "v1").people().connections()
        for page in self._pages(
            "주소록 조회", connection.list, resourceName="people/me", pageSize=1000,
            sources=CONTACT_SOURCE, personFields=PERSON_FIELDS,
        ):
            if "totalItems" in page:
                expected = page["totalItems"]
            for person in page.get("connections", []):
                name = person.get("resourceName")
                if not name or name in seen:
                    raise GoogleApiError("주소록 페이지의 연락처 식별자가 누락되거나 중복되었습니다.")
                seen.add(name)
                # connections.list truncates each person's phone list at 100.
                if len(person.get("phoneNumbers", [])) >= 100:
                    detail = _call("전체 전화번호 확인", self._service("people", "v1").people().getBatchGet(
                        resourceNames=[name], sources=CONTACT_SOURCE, personFields=PERSON_FIELDS
                    )).get("responses", [])
                    if len(detail) != 1 or detail[0].get("person", {}).get("resourceName") != name:
                        raise GoogleApiError("전화번호 전체 목록을 확인할 수 없습니다.")
                    person = detail[0]["person"]
                people.append(person)
        if expected is not None and expected != len(people):
            raise GoogleApiError("주소록 전체 건수와 수집한 건수가 다릅니다. 다시 비교하세요.")
        for group in (imported, press):
            count = sum(group["resourceName"] in _groups_on(person) for person in people)
            if count != group.get("memberCount", 0):
                raise GoogleApiError("라벨의 멤버 수와 주소록에서 확인한 수가 다릅니다. 다시 비교하세요.")
        self._group_ids = (imported["resourceName"], press["resourceName"])
        return people, self._group_ids[0], self._group_ids[1]

    def get_contact(self, resource_name):
        self._authorized()
        if not re.fullmatch(r"people/[a-zA-Z0-9_-]+", resource_name or ""):
            raise GoogleApiError("연락처 리소스 ID를 확인하세요.")
        return _call("연락처 재조회", self._service("people", "v1").people().get(
            resourceName=resource_name, sources=CONTACT_SOURCE, personFields=PERSON_FIELDS
        ))

    def _write_groups(self):
        if not self.write:
            raise GoogleApiError("주소록 쓰기 모드를 명시해야 합니다.")
        self._authorized()
        if not self._group_ids:
            imported, press = self._target_groups()
            self._group_ids = imported["resourceName"], press["resourceName"]
        return self._group_ids

    def _mutate_once(self, label, request):
        # httplib2 can replay a request on a disconnected socket even with
        # HttpRequest.execute(num_retries=0). Send the discovery-built request
        # once, including on ambiguous disconnects, timeouts or redirects.
        import requests

        headers = {"Content-Type": "application/json"}
        if "If-Match" in request.headers:
            headers["If-Match"] = request.headers["If-Match"]
        self.creds.apply(headers, token=self._verified_token)
        prepared = requests.Request(
            request.method, request.uri, data=request.body.encode("utf-8"), headers=headers
        ).prepare()
        try:
            with requests.Session() as session:
                response = session.send(prepared, timeout=(10, 45), allow_redirects=False)
                if not 200 <= response.status_code < 300:
                    raise GoogleApiError(f"{label} 요청 실패 (HTTP {response.status_code}).")
                return response.json()
        except (requests.RequestException, ValueError):
            raise GoogleApiError(f"{label} 결과를 확인할 수 없습니다. 변경 대상을 재조회하세요.") from None

    def rename_target(self, group_id, old_name, new_name):
        """Rename the reviewed group in place and return the freshly read ContactGroup."""
        if not self.write or old_name not in IMPORT_NAMES or new_name != CURRENT_LABEL:
            raise GoogleApiError("동문회 가져오기 라벨의 지정된 이름 변경과 쓰기 모드가 필요합니다.")
        self._authorized()
        target, press = self._target_groups()
        if (not group_id or target.get("resourceName") != group_id
                or group_id == press.get("resourceName")):
            raise GoogleApiError("검토한 라벨 ID와 현재의 동문회 대상 라벨 ID가 다릅니다.")
        groups = self._service("people", "v1").contactGroups()

        def read_group():
            group = _call("동문회 라벨 재조회", groups.get(
                resourceName=group_id, maxMembers=0, groupFields="name,groupType,memberCount",
            ))
            if group.get("resourceName") != group_id or group.get("groupType") != "USER_CONTACT_GROUP":
                raise GoogleApiError("재조회한 동문회 라벨의 ID 또는 유형이 다릅니다.")
            return group

        current = read_group()
        if current.get("name") == new_name:
            return current
        etag = current.get("etag")
        if current.get("name") not in IMPORT_NAMES or not isinstance(etag, str) or not etag:
            raise GoogleApiError("현재 라벨의 이전 이름과 etag를 확인할 수 없습니다.")
        body = {
            "contactGroup": {"resourceName": group_id, "etag": etag, "name": new_name},
            "updateGroupFields": "name", "readGroupFields": "name,groupType",
        }
        request = groups.update(resourceName=group_id, body=body)
        request.headers["If-Match"] = etag if etag.startswith(('"', 'W/"')) else f'"{etag}"'
        self._mutate_once("동문회 라벨 이름 변경", request)
        verified = read_group()
        if verified.get("name") != new_name:
            raise GoogleApiError("같은 ID에서 변경된 라벨 이름을 재확인해야 합니다.")
        return verified

    def create_contact(self, person):
        imported, _ = self._write_groups()
        if (set(person) - {"names", "phoneNumbers", "organizations", "memberships"}
                or _groups_on(person) != {imported}):
            raise GoogleApiError("신규 연락처 필드와 가져오기 라벨을 확인하세요.")
        return self._mutate_once("연락처 생성", self._service("people", "v1").people().createContact(
            body=person, personFields=PERSON_FIELDS, sources=CONTACT_SOURCE
        ))

    def update_contact(self, person, fields):
        imported, press = self._write_groups()
        fields = fields.split(",") if isinstance(fields, str) else list(fields)
        allowed = {"names", "organizations", "phoneNumbers"}
        if not fields or any(f not in allowed or not person.get(f) for f in fields):
            raise GoogleApiError("관리 대상 수정 필드와 값이 필요합니다.")
        resource_name = person.get("resourceName")
        current = self.get_contact(resource_name)
        groups = _groups_on(current)
        if imported not in groups or press in groups:
            raise GoogleApiError("현재 라벨이 동문회 연락처 수정 조건에 맞지 않습니다.")

        def contact_source(card):
            return [s for s in card.get("metadata", {}).get("sources", [])
                    if s.get("type") == "CONTACT"]

        source = contact_source(person)
        latest = contact_source(current)
        if (len(source) != 1 or len(latest) != 1 or not source[0].get("etag")
                or not source[0].get("id") or source[0]["id"] != latest[0].get("id")
                or source[0]["etag"] != latest[0].get("etag")):
            raise GoogleApiError("검토한 연락처의 CONTACT etag가 현재 값과 다릅니다.")
        body = {field: person[field] for field in fields}
        body["metadata"] = {"sources": [{key: source[0][key] for key in ("type", "id", "etag")}]}
        return self._mutate_once("연락처 수정", self._service("people", "v1").people().updateContact(
            resourceName=resource_name, body=body, updatePersonFields=",".join(fields),
            personFields=PERSON_FIELDS, sources=CONTACT_SOURCE,
        ))
