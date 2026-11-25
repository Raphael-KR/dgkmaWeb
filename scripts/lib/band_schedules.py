"""Read the display fields of BAND schedule cards from a verified source post."""

from datetime import datetime
from zoneinfo import ZoneInfo

from .band_source_text import URL, url_status


KST = ZoneInfo("Asia/Seoul")


def public_text(value):
    if value is None:
        return ""
    if not isinstance(value, str) or "\x00" in value:
        raise ValueError("Invalid schedule text")
    if any(url_status(match[0]) == "review" for match in URL.finditer(value)):
        raise ValueError("Protected URL in schedule text")
    return " ".join(value.split())


def schedule_period(card):
    all_day = card["is_all_day"]
    if not isinstance(all_day, bool) or card.get("is_lunar"):
        raise ValueError("Unknown calendar or time precision")
    # A calendar day belongs to the event's zone. Timed events are shown in Korea time.
    zone = ZoneInfo(card["schedule_time_zone_id"]) if all_day else KST

    def timestamp(value):
        parsed = datetime.fromisoformat(value)
        if parsed.utcoffset() is None:
            raise ValueError("Missing schedule time offset")
        return parsed.astimezone(zone)

    def day(value):
        return f"{value.year}년 {value.month}월 {value.day}일"

    start = timestamp(card["start_at"])
    end = timestamp(card["end_at"]) if card.get("end_at") else None
    if end and end < start:
        raise ValueError("Schedule ends before it starts")
    if all_day:
        return day(start) if not end or end.date() == start.date() else f"{day(start)} ~ {day(end)}"
    period = f"{day(start)} {start:%H:%M}"
    if end and end != start:
        until = f"{end:%H:%M}" if end.date() == start.date() else f"{day(end)} {end:%H:%M}"
        period += f" ~ {until}"
    return period


def schedule_fields(attachments, band):
    """Return only printable fields. Defer an ambiguous card on its own source post."""
    if not (attachments.get("schedule") or attachments.get("schedule_group")):
        return {}
    try:
        cards = []
        if attachments.get("schedule"):
            single = attachments["schedule"]
            cards.extend(single if isinstance(single, list) else [single])
        for group in attachments.get("schedule_group", []):
            cards.extend(group["schedules"])
        schedules = {}
        hidden = set()
        for card in cards:
            key = card["schedule_id"]
            if not isinstance(key, str) or not key:
                raise ValueError("Missing schedule identity")
            if card.get("is_delete") is True or card.get("is_secret") or card.get("secret_sharers"):
                hidden.add(key)
                continue
            if card.get("is_delete") is not False or str(card["band_no"]) != band:
                raise ValueError("Unverified schedule scope")
            title = public_text(card["name"])
            if not title:
                raise ValueError("Missing schedule title")
            location = card.get("location") or {}
            place, address = public_text(location.get("name")), public_text(location.get("address"))
            venue = f"{place} ({address})" if place and address and place != address else place or address
            item = {"title": title, "period": schedule_period(card), "venue": venue}
            if key in schedules and schedules[key] != item:
                raise ValueError("Conflicting schedule copies")
            schedules[key] = item
        result = [item for key, item in schedules.items() if key not in hidden]
        return {"scheduleDetails": result} if result else {}
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
        return {"scheduleNeedsReview": True}
