"""Prepare private BAND post text for review from a completed daily local backup."""

import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from tempfile import NamedTemporaryFile
from lib.band_schedules import schedule_fields
from lib.band_source_text import URL, body_fields, url_status, visible_band_text


ROOT = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"
KST = timezone(timedelta(hours=9))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def source_author_key(author):
    uid = author.get("user_no")
    if type(uid) is not int or uid <= 0:
        return None
    return digest(f"band:{BAND}:user:{uid}".encode())


def prepare(item, source_id):
    data = item["sourceData"]
    url = f"https://band.us/band/{BAND}/post/{source_id}"
    if (not source_id.isdecimal() or source_id != str(data["post_no"])
            or item["postId"] != source_id or str(item["bandNo"]) != BAND
            or url != data["web_url"]):
        raise ValueError(f"Source identity or URL mismatch for post {source_id}")
    timestamp = data["created_at"]
    if type(timestamp) is not int:
        raise ValueError(f"Invalid millisecond timestamp for post {source_id}")
    instant = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=timestamp)
    counts = {key: len(value) if isinstance(value, list) else 1
              for key, value in data["attachment"].items() if value}
    record = {
        "sourceId": source_id,
        "importSource": {"schemaVersion": 1, "platform": "band", "containerId": BAND,
                         "sourceId": source_id, "boardPath": ["밴드"], "url": url,
                         "originalCreatedAt": instant.isoformat(), "timePrecision": "minute"},
        "sourceAuthorKey": source_author_key(data["author"]),
        "authorName": None, "authorReviewRequired": True,
        "attachmentCounts": counts,
        "expectedPhotos": data["photo_count"], "expectedVideos": data["video_count"],
        "expectedComments": data["comment_count"],
        "title": None, "titleSource": None, "content": None, "bodyStatus": None,
    }
    raw = data["content"]
    # Do not export text or a derived title when a source restriction is set.
    if data["is_restricted"] is not False or data["copiable_state"] not in ("unassigned", "enabled"):
        record["bodyStatus"] = "restricted"
        return instant, record
    if not isinstance(raw, str):
        record["bodyStatus"] = "source-text-unavailable"
        return instant, record
    visible = visible_band_text(raw)
    if visible is None:
        record["bodyStatus"] = "unknown-source-markup"
        return instant, record
    if any(url_status(m[0]) == "review" for m in URL.finditer(visible)):
        record["bodyStatus"] = "url-review"
        return instant, record
    record.update(body_fields(visible))
    record.update(schedule_fields(data["attachment"], BAND))
    return instant, record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("through", type=date.fromisoformat, help="last completed day in Korea")
    through = parser.parse_args().through
    if through >= datetime.now(KST).date():
        parser.error("Cutoff must be a completed Korean calendar date")
    os.umask(0o077)
    source = ROOT / f"band-{BAND}"
    index = json.loads((source / "index.json").read_bytes())
    if (str(index["bandNo"]) != BAND or not index["complete"]
            or through > date.fromisoformat(index["daily"]["coveredThrough"])):
        raise ValueError("Requested date is outside the indexed BAND backup")
    posts = []
    with sqlite3.connect((ROOT / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        rows = db.execute("""SELECT source_id,raw_sha256,raw_json FROM source_items
            WHERE source='band' AND container_id=? AND kind='post' ORDER BY source_id""", (BAND,))
        seen = set()
        for source_id, expected_hash, raw in rows:
            entry = index["posts"].get(source_id)
            if entry is None or entry["sha256"] != expected_hash or digest(raw.encode()) != expected_hash:
                raise ValueError(f"Backup/index digest mismatch for post {source_id}")
            seen.add(source_id)
            instant, post = prepare(json.loads(raw), source_id)
            if instant.astimezone(KST).date() <= through:
                posts.append(post)
    if seen != index["posts"].keys():
        raise ValueError(f"Post inventory mismatch: indexed={len(index['posts'])}, rows={len(seen)}")
    summary = dict(Counter(post["bodyStatus"] for post in posts))
    payload = {
        "format": "band-post-text-review-v1", "throughKst": through.isoformat(),
        "stage": "local-review-only", "summary": summary, "posts": posts,
    }
    destination = ROOT / "migration" / f"band-{through}"
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    with NamedTemporaryFile("w", dir=destination, encoding="utf-8", delete=False) as output:
        try:
            json.dump(payload, output, ensure_ascii=False, separators=(",", ":"))
            output.flush()
            os.replace(output.name, destination / "posts.json")
        finally:
            Path(output.name).unlink(missing_ok=True)
    print(json.dumps({"posts": len(posts), "bodyStatuses": summary}))


if __name__ == "__main__":
    main()
