#!/usr/bin/env python3
"""Prepare private BAND comment candidates from the completed local backup."""

import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from lib.band_source_text import URL, url_status, visible_band_text
from lib.band_comment_media import media_entry, read_receipts


ARCHIVE = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"
KST = ZoneInfo("Asia/Seoul")


def clean_body(body, restricted):
    if restricted:
        return None, "restricted"
    if body is None:
        return "", "no-source-text"
    if not isinstance(body, str):
        return None, "source-text-unavailable"
    visible = visible_band_text(body)
    if visible is None:
        return None, "unknown-source-markup"
    if "\x00" in visible:
        return None, "unsupported-control"
    if any(url_status(match[0]) == "review" for match in URL.finditer(visible)):
        return None, "url-review"
    return visible, "converted" if visible.strip() else "no-source-text"


def positive_id(value):
    raw = str(value)
    if raw.isascii() and raw.isdecimal() and int(raw) > 0:
        return str(int(raw))
    return None


def author_key(author):
    uid = positive_id((author or {}).get("user_no"))
    if uid is None:
        return None
    return hashlib.sha256(f"band:{BAND}:user:{uid}".encode()).hexdigest()


def image_key(url):
    parsed = urlsplit(url)
    return parsed.hostname, parsed.path


def load_assets(db, folder):
    # Compare original image/thumbnail paths in memory. Signed URLs never enter the bundle.
    paths = defaultdict(set)
    photo_index = json.loads((folder / "photo-list-index.json").read_text())
    for photo in photo_index["photos"].values():
        for field in ("photo_url", "photo_thumbnail"):
            if photo.get(field):
                paths[image_key(photo[field])].add(str(photo["photo_no"]))
    assets = {}
    photos = {}
    for key, status, location, digest, metadata in db.execute(
        "SELECT source_id,status,local_path,sha256,metadata_json FROM assets "
        "WHERE source='band' AND container_id=?", (BAND,)
    ):
        record = (key, status, location, digest)
        assets[key] = record
        photo_id = json.loads(metadata).get("photoNo")
        if photo_id:
            photos[str(photo_id)] = record
    return paths, photos, assets


def attachment(kind, record, folder):
    result = {"kind": kind, "status": "no_local_match"}
    if record is None:
        return result
    key, status, location, digest = record
    result["sourceAssetId"] = key
    if status != "saved":
        result["status"] = status
        return result
    if not location:
        raise ValueError(f"누락된 로컬 파일 경로. 종류 {kind}, 저장 상태 {status}")
    path = (folder / location).resolve()
    if not path.is_relative_to(folder) or not path.is_file():
        raise ValueError(f"원본 파일이 없거나 해당 밴드 범위 밖에 있음. 종류 {kind}")
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != digest:
        raise ValueError(f"첨부 해시 불일치. 종류 {kind}, 기대 {digest}, 실제 {actual}")
    result.update(status="local_verified", sha256=actual, bytes=path.stat().st_size)
    return result


def attachments(item, catalog, folder, key, receipts):
    paths, photos, assets = catalog
    entries = []
    for position, image in enumerate(item.get("photos", []), 1):
        location = image_key(image["url"])
        ids = paths.get(location, set())
        record = photos.get(next(iter(ids))) if len(ids) == 1 else None
        source_id = f"{key}/photo:{position}"
        saved = media_entry(receipts, source_id, image["url"])
        if saved:
            record = (source_id, saved["status"], saved.get("file"), saved.get("sha256"))
        entry = attachment("photo", record, folder)
        # Let a later authorized backfill match the exact URL without exporting it.
        entry["sourceImageKey"] = hashlib.sha256(
            f"{location[0]}{location[1]}".encode()
        ).hexdigest()
        entries.append(entry)
    if item.get("sticker"):
        sticker = item["sticker"]
        pack, variant = positive_id(sticker.get("pack_no")), positive_id(sticker.get("sticker_id"))
        entry = {"kind": "sticker", "status": "not_archived"}
        if pack and variant:
            entry["sourceAssetId"] = f"sticker:{pack}:{variant}"
        entries.append(entry)
    for kind in ("video", "file"):
        if item.get(kind):
            source_id = positive_id(item[kind].get("id"))
            asset_id = f"{kind}:{source_id}" if source_id else None
            record = assets.get(asset_id)
            if kind == "video" and asset_id:
                saved = media_entry(receipts, f"{key}/{asset_id}", item[kind]["logo_image"])
                if saved:
                    record = (asset_id, saved["status"], saved.get("file"), saved.get("sha256"))
            entry = attachment(kind, record, folder)
            if asset_id:
                entry["sourceAssetId"] = asset_id
            entries.append(entry)
    return entries


def backup_rows(db, kind):
    return db.execute(
        "SELECT source_id,raw_json FROM source_items WHERE source='band' "
        "AND container_id=? AND kind=? ORDER BY source_id", (BAND, kind)
    )


def prepare(db, through):
    folder = (ARCHIVE / f"band-{BAND}").resolve()
    checkpoint_row = db.execute(
        "SELECT checkpoint_json FROM sources WHERE source='band' AND container_id=?", (BAND,)
    ).fetchone()
    if checkpoint_row is None:
        raise ValueError(f"밴드 {BAND}의 백업 체크포인트가 없습니다.")
    latest = json.loads(checkpoint_row[0]).get("daily", {}).get("coveredThrough")
    if latest != through.isoformat():
        raise ValueError(f"백업 마감일 불일치. 요청 {through}, 체크포인트 {latest}")
    cutoff = datetime.combine(through + timedelta(days=1), time.min, KST).timestamp()
    expected = {
        pid: json.loads(raw)["sourceData"]["comment_count"] for pid, raw in backup_rows(db, "post")
    }
    catalog = load_assets(db, folder)
    seen = set()
    records = []
    totals = Counter()
    per_post = Counter()
    media = Counter()
    body_statuses = Counter()
    authors = set()
    for _, raw in backup_rows(db, "comments"):
        group = json.loads(raw)
        post = str(group["postNo"])
        receipts = read_receipts(folder, post)
        if post not in expected:
            raise ValueError(f"댓글의 원게시글 누락. 원글 ID {post}")
        for page in group["pages"]:
            for top in page["items"]:
                parent = positive_id(top["comment_id"])
                replies = top.get("latest_comment", [])
                if len(replies) != top["comment_count"]:
                    raise ValueError(
                        f"답글 수 불일치. 글 {post}, 댓글 {parent}, "
                        f"기대 {top['comment_count']}, 실제 {len(replies)}"
                    )
                for parent_id, item in [(None, top), *((parent, r) for r in replies)]:
                    cid = positive_id(item["comment_id"])
                    if cid is None or str(item["post_no"]) != post:
                        raise ValueError(f"댓글 식별자 또는 소속 불일치. 기대 글 {post}, 댓글 {cid}")
                    if parent_id and str(item.get("origin_comment_id")) != parent_id:
                        raise ValueError(f"상위 댓글 불일치. 글 {post}, 기대 상위 {parent_id}")
                    base = f"post:{post}/comment:"
                    parent_key = base + parent_id if parent_id else None
                    key = f"{parent_key}/reply:{cid}" if parent_key else base + cid
                    if key in seen:
                        raise ValueError(f"댓글·답글 원천 키 중복. {key}")
                    seen.add(key)
                    timestamp = item["created_at"] / 1000
                    if timestamp >= cutoff:
                        raise ValueError(f"마감 이후 댓글. {key}, 기록 시각 {item['created_at']}")
                    author = item.get("author") or {}
                    identity = author_key(author)
                    files = attachments(item, catalog, folder, key, receipts)
                    restricted = any(item.get(k) for k in (
                        "is_secret", "is_restricted", "is_visible_only_to_author"
                    ))
                    content, body_status = clean_body(item.get("body"), restricted)
                    body_statuses[body_status] += 1
                    records.append({
                        "sourcePostId": post,
                        "sourceKey": key,
                        "parentSourceKey": parent_key,
                        "sourceAuthorKey": identity,
                        "authorName": None,
                        "authorVerification": "pending" if identity else "source_author_missing",
                        "sourceAuthorDeleted": bool(author.get("is_deleted")) if author else None,
                        "createdAt": datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="milliseconds"),
                        "content": content,
                        "bodyStatus": body_status,
                        "attachments": files,
                        "sourceRestricted": restricted,
                    })
                    per_post[post] += 1
                    totals["replies" if parent_key else "topLevelComments"] += 1
                    totals["sourceAuthorMissing"] += identity is None
                    totals["sourceAuthorDeleted"] += bool(author.get("is_deleted"))
                    totals["sourceRestricted"] += restricted
                    totals["withoutText"] += body_status == "no-source-text"
                    totals["withoutTextOrAttachment"] += body_status == "no-source-text" and not files
                    totals["over1000Characters"] += len((content or "").encode("utf-16-le")) // 2 > 1000
                    totals["multipleAttachments"] += len(files) > 1
                    for f in files:
                        media[f["kind"], f["status"]] += 1
                    if identity:
                        authors.add(identity)
    for post, count in expected.items():
        if per_post[post] != count:
            raise ValueError(f"글 {post} 댓글·답글 수 불일치. 기대 {count}, 실제 {per_post[post]}")
    return {
        "source": "band", "containerId": BAND, "throughKst": str(through),
        "summary": {**totals, "total": len(records), "postsWithComments": len(per_post),
                    "distinctSourceAuthorKeys": len(authors),
                    "bodyStatuses": dict(sorted(body_statuses.items())),
                    "attachmentCounts": [
                        {"kind": k, "status": s, "count": n}
                        for (k, s), n in sorted(media.items())
                    ]},
        "comments": records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--through", required=True, type=date.fromisoformat,
                        help="완료된 밴드 백업의 한국 시간 마감일 YYYY-MM-DD")
    args = parser.parse_args()
    uri = (ARCHIVE / "archive.sqlite3").as_uri() + "?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    try:
        bundle = prepare(db, args.through)
    finally:
        db.close()
    dest = ARCHIVE / "migration" / f"band-{args.through}"
    dest.mkdir(mode=0o700, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=dest, delete=False) as out:
        tmp = Path(out.name)
        try:
            json.dump(bundle, out, ensure_ascii=False, separators=(",", ":"))
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    try:
        os.replace(tmp, dest / "comments.json")
    finally:
        tmp.unlink(missing_ok=True)
    print(json.dumps(bundle["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
