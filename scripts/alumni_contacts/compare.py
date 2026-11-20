"""Compare the alumni sheet with contact cards without changing either input."""

from collections import defaultdict
import re
import unicodedata


MANAGED_GROUPS = {"문자발송대상", "본인사망", "신상미파악", "수신거부", "해외"}
MOBILE_TYPES = {"mobile", "휴대전화", "휴대폰", "핸드폰"}


def _text(value):
    return unicodedata.normalize("NFC", str(value or "")).strip()


def mobile_key(value):
    """Return the domestic mobile PK, including reserved 010-0000 numbers."""
    number = unicodedata.normalize("NFKC", str(value or "")).strip()
    number = re.sub(r"[\s().-]", "", number)
    for prefix in ("+82", "0082"):
        if number.startswith(prefix):
            number = number[len(prefix):]
            if not number.startswith("0"):
                number = "0" + number
            break
    if re.fullmatch(r"010[0-9]{8}|01[16789][0-9]{7,8}", number):
        return number
    return ""


def managed_org_index(row, card):
    """Return an owned org's index or None for an empty slot. Hold unclear ownership."""
    orgs = card.get("orgs", [])
    groups = [i for i, org in enumerate(orgs) if _text(org.get("name")) in MANAGED_GROUPS]
    if len(groups) == 1:
        if not _text(row.get("org")):
            raise ValueError("clearing a managed organization requires review")
        return groups[0]
    if groups or (orgs and (_text(row.get("org")) or _text(row.get("title")))):
        raise ValueError("organization ownership requires review")
    return None


def _name_key(record):
    # Korean CSV exports may have stored the family/given components in one cell.
    return "".join((_text(record.get("last")) + _text(record.get("first"))).split())


def _differences(row, card, phone):
    diff = [key for key in ("first", "last") if _text(row[key]) != _text(card.get(key))]
    matching_slots = [i for i, number in enumerate(card["phones"]) if mobile_key(number) == phone]
    if len(matching_slots) != 1:
        return "identity_conflict", diff
    types = card.get("phone_types", [])
    index = matching_slots[0]
    phone_type = _text(types[index]).lstrip("*").strip().casefold() if index < len(types) else ""
    if phone_type not in MOBILE_TYPES:
        diff.append("phone_type")
    try:
        index = managed_org_index(row, card)
    except ValueError:
        return "organization_review", diff
    org = {} if index is None else card["orgs"][index]
    for field, contact_field in (("org", "name"), ("title", "title")):
        if _text(row[field]) != _text(org.get(contact_field)):
            diff.append(field)
    return ("update" if diff else "same"), diff


def _phone_components(card_phones, by_phone):
    """Find cards that share a PK, including collisions on a secondary number."""
    components = {}
    for i in range(len(card_phones)):
        if i in components:
            continue
        group = {i}
        pending = [i]
        while pending:
            for phone in card_phones[pending.pop()]:
                neighbors = by_phone[phone] - group
                pending.extend(neighbors)
                group.update(neighbors)
        for j in group:
            components[j] = group
    return components


def compare(rows, cards):
    """Return one decision per source row, then any unclaimed target cards.

    ids are candidate card identifiers. Raw field values never enter the report.
    A shared name alone cannot establish a new key or choose between two cards.
    """
    rows = list(rows)
    cards = list(cards)
    by_phone = defaultdict(set)
    by_name = defaultdict(set)
    source_by_phone = defaultdict(set)
    source_by_name = defaultdict(set)
    card_phones = []
    for i, card in enumerate(cards):
        phones = {key for value in card["phones"] if (key := mobile_key(value))}
        card_phones.append(phones)
        for phone in phones:
            by_phone[phone].add(i)
        name = _name_key(card)
        if name:
            by_name[name].add(i)
    source_phones = [mobile_key(row["phone"]) for row in rows]
    source_names = [_name_key(row) for row in rows]
    for i, (phone, name) in enumerate(zip(source_phones, source_names)):
        if phone:
            source_by_phone[phone].add(i)
        if name:
            source_by_name[name].add(i)

    card_rows = [
        {i for phone in phones for i in source_by_phone[phone]} for phones in card_phones
    ]
    components = _phone_components(card_phones, by_phone)
    seen = set()
    results = []

    def record(row_number, status, indices, diff=()):
        seen.update(indices)
        ids = sorted(cards[i]["id"] for i in indices)
        results.append({"row": row_number, "status": status, "ids": ids, "diff": list(diff)})

    for i, row in enumerate(rows):
        phone, name = source_phones[i], source_names[i]
        direct = by_phone[phone]
        namesakes = by_name[name]
        siblings = source_by_name[name]
        # Two people with the same full name and separate, consistent PKs can
        # each match their own card. A namesake with no such match stays open.
        unresolved = {c for c in namesakes - direct if not card_rows[c] & (siblings - {i})}
        matched = direct | unresolved if direct else namesakes
        candidates = {other for c in matched for other in components[c]}
        number = row["row"]
        group = _text(row["org"])
        if not phone or not _text(row["first"]) or not _text(row["last"]):
            record(number, "source_invalid", direct | namesakes)
        elif len(source_by_phone[phone]) > 1:
            record(number, "duplicate_source_key", direct | namesakes)
        elif any(cards[c].get("press") for c in candidates):
            record(number, "protected", candidates)
        elif any(not cards[c]["target"] for c in candidates):
            record(number, "outside_label", candidates)
        elif len(direct) > 1 or any(len(components[c]) > 1 for c in direct):
            record(number, "duplicate_target_key", candidates)
        elif (group and group not in MANAGED_GROUPS) or (not group and _text(row["title"])):
            record(number, "organization_review", candidates)
        elif direct:
            c = next(iter(direct))
            unmatched_sibling = any(not by_phone[source_phones[j]] for j in siblings - {i})
            if len(card_rows[c]) > 1 or (c in namesakes and unmatched_sibling):
                record(number, "shared_card", candidates)
            elif unresolved or (source_by_name[_name_key(cards[c])] - siblings):
                record(number, "identity_conflict", candidates)
            else:
                status, diff = _differences(row, cards[c], phone)
                record(number, status, direct, diff)
        elif namesakes:
            if any(card_rows[c] & siblings for c in namesakes):
                record(number, "shared_card", namesakes)
            else:
                record(number, "key_change_review", namesakes)
        else:
            sibling_phones = {source_phones[j] for j in siblings} - {""}
            ambiguous = len(sibling_phones) > 1 and not any(by_phone[p] for p in sibling_phones)
            record(number, "source_namesake" if ambiguous else "new_candidate", set())

    for c, card in enumerate(cards):
        if not card["target"] or c in seen:
            continue
        # Report an unclaimed duplicate component once, including cross-label
        # conflicts. Only the target cards need a standalone report row.
        component = components[c]
        if any(cards[index].get("press") for index in component):
            status = "protected"
        elif any(not cards[index]["target"] for index in component):
            status = "outside_label"
        elif len(component) > 1:
            status = "duplicate_target_key"
        else:
            status = "target_only"
        record(None, status, component)

    return results
