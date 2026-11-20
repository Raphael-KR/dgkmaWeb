"""Read the roster projection and convert Google CSV / People records for comparison."""
import csv
import re

IMPORT_LABEL = "3. 6.에 가져옴"
CURRENT_LABEL = "2026-11-20"
IMPORT_NAMES = frozenset((IMPORT_LABEL, "3.6.에 가져옴"))
TARGET_NAMES = IMPORT_NAMES | {CURRENT_LABEL}
PRESS_LABEL = "신문사"
SOURCE_HEADER = [
    "Family Name", "Given Name", "Phone 1 - Type", "Phone 1 - Value",
    "Organization 1 - Name", "Organization 1 - Title", "Group Membership",
]


def source_rows(values):
    if not values or list(values[0]) != SOURCE_HEADER:
        raise ValueError("구글주소록양식의 7개 헤더 또는 순서가 다릅니다.")
    result = []
    for index, line in enumerate(values[1:], 2):
        if not any(line):
            continue
        if len(line) > len(SOURCE_HEADER):
            raise ValueError(f"원본 {index}행의 열 수가 예상한 7개를 넘습니다.")
        last, first, kind, phone, org, title, _ = list(line) + [""] * (7 - len(line))
        if kind.lower() != "mobile":
            raise ValueError(f"원본 {index}행의 전화 유형이 Mobile과 다릅니다.")
        result.append(dict(row=index, first=first, last=last, phone=phone, org=org, title=title))
    if not result:
        raise ValueError("원본의 유효 행이 0개입니다.")
    return result


def read_source_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as stream:
        return source_rows(list(csv.reader(stream)))


def split_values(value):
    return [part.strip() for part in value.split(":::") if part.strip()]


def read_contacts_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames or []
        required = {"First Name", "Last Name", "Labels", "Phone 1 - Value"}
        if not required.issubset(fields) or len(set(fields)) != len(fields):
            raise ValueError("Google 주소록 CSV에 필요한 열이 없거나 중복되었습니다.")
        phone_cols = [col for col in fields if re.fullmatch(r"Phone \d+ - Value", col)]
        cards = []
        target_labels = set()
        for index, item in enumerate(reader, 2):
            labels = split_values(item["Labels"])
            matched = TARGET_NAMES.intersection(labels)
            target_labels.update(matched)
            if len(target_labels) > 1:
                raise ValueError("CSV에 동문회 대상 라벨이 둘 이상 있습니다. 대상 라벨을 확인하세요.")
            phones, types = [], []
            for col in phone_cols:
                values = split_values(item[col])
                phones.extend(values)
                types.extend([item.get(col.replace("Value", "Label"), "")] * len(values))
            org = {"name": item.get("Organization Name", ""), "title": item.get("Organization Title", "")}
            cards.append(dict(id=f"csv:{index}", first=item["First Name"], last=item["Last Name"],
                              middle=item.get("Middle Name", ""), phones=phones, phone_types=types,
                              orgs=[org] if any(org.values()) else [], target=bool(matched),
                              press=PRESS_LABEL in labels))
    if not target_labels:
        raise ValueError(f"CSV에서 '{IMPORT_LABEL}' 또는 '{CURRENT_LABEL}' 라벨을 찾지 못했습니다.")
    return cards


def people_card(person, target_group, press_group):
    groups = {m["contactGroupMembership"].get("contactGroupResourceName")
              for m in person.get("memberships", []) if "contactGroupMembership" in m}
    names = person.get("names", [])
    name = next((n for n in names if n.get("metadata", {}).get("primary")), names[0] if names else {})
    numbers = person.get("phoneNumbers", [])
    return dict(id=person["resourceName"], first=name.get("givenName", ""), last=name.get("familyName", ""),
                middle=name.get("middleName", ""), phones=[n.get("value", "") for n in numbers],
                phone_types=[n.get("type", "") for n in numbers],
                orgs=[{"name": o.get("name", ""), "title": o.get("title", "")}
                      for o in person.get("organizations", [])],
                target=target_group in groups, press=bool(press_group and press_group in groups))
