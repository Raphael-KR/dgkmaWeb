"""Prepare a private, source-keyed BAND classification for a completed local backup."""

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
from zoneinfo import ZoneInfo
from lib.band_body_review import automatic_post_scope
from lib.band_hashtags import FOLDER_TAGS, TOPIC_TAGS, source_tags


ROOT = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND_ID = "11089836"
BAND_DIR = ROOT / f"band-{BAND_ID}"
SEOUL = ZoneInfo("Asia/Seoul")
TOPIC_PREFIXES = {
    "obituary": re.compile(r"^(?:訃告|부고|부음)(?:\s|$|[\]:〉>·】])"),
    "celebration": re.compile(r"^(?:결혼|개원|축결혼|축개원|화촉)(?:\s|$|[\]:〉>·】])"),
    "notice": re.compile(r"^공지(?:사항)?(?:\s|$|[\]:〉>·】])"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_index(filename, digests):
    data = (BAND_DIR / filename).read_bytes()
    digests[filename] = sha256(data)
    return json.loads(data)


def source_rows(db, kind):
    return db.execute(
        "SELECT source_id, raw_json, raw_sha256 FROM source_items "
        "WHERE source='band' AND container_id=? AND kind=? ORDER BY source_id",
        (BAND_ID, kind),
    )


def checked_document(source_id, raw, digest):
    require(sha256(raw.encode()) == digest, f"source document digest mismatch: {source_id}")
    return json.loads(raw)


def check_day(timestamp, cutoff, key):
    day = datetime.fromtimestamp(timestamp / 1000, SEOUL).date()
    require(day <= cutoff, f"{key}: source day {day} exceeds snapshot {cutoff}")


def classify_announcement(doc):
    app = doc.get("app_id")
    try:
        payload = json.loads(doc.get("app_payload", ""))
    except (ValueError, TypeError):
        payload = None
    if not isinstance(payload, dict):
        payload = {}
    # Only the structured card type is used. Displayed members are not post authors.
    if app == 2 and isinstance(payload.get("members"), list) and type(payload.get("count")) is int:
        return {"cardType": "join_welcome", "disposition": "exclude",
                "declaredMembers": payload["count"], "listedMembers": len(payload["members"])}
    if app == 3 and type(payload.get("anniversary")) is int and isinstance(payload.get("since"), str):
        return {"cardType": "band_anniversary", "disposition": "exclude"}
    if app == 5 and isinstance(payload.get("mission"), dict) and type(payload["mission"].get("mission_id")) is int:
        return {"cardType": "band_mission", "disposition": "exclude"}
    return {"cardType": "unrecognized", "disposition": "unresolved"}


def classify(post):
    text = post["content"]
    scope = automatic_post_scope(post)
    wrapped, literal = source_tags(text)
    hashtags = wrapped | literal
    known = FOLDER_TAGS.keys() | TOPIC_TAGS
    candidates = defaultdict(list)
    for tag, category in FOLDER_TAGS.items():
        if tag in hashtags:
            candidates[category].append("tag:" + tag)
    reasons = []
    if post.get("is_notice") or post.get("is_major_notice"):
        candidates["notice"].append("source_notice_flag")
    if post.get("is_automatic_posting") is True:
        reasons.append("automatic_post")
    elif scope:
        reasons.append("legacy_automatic_template")
    if post.get("posting_usage") == "new_member":
        reasons.append("new_member")
    if post.get("view_type") in ("birthday", "anniversary"):
        reasons.append(post["view_type"])
    for tag in ("알림", "안내"):
        if tag in hashtags:
            reasons.append("tag:" + tag)
    for kind in ("schedule", "schedule_group"):
        if post["attachment"].get(kind):
            candidates["event"].append("attachment:" + kind)
    if "photo_album" in post["attachment"]:
        reasons.append("photo_album_attachment")
    if not text.strip():
        reasons.append("attachment_only")
    for category, pattern in TOPIC_PREFIXES.items():
        if pattern.match(text.lstrip(" \t\n\r[【〈<■◆◎▷▶◈")):
            candidates[category].append("subject_prefix")
    if scope:
        state = "platform_generated_review"
    elif post.get("view_type") in ("birthday", "anniversary"):
        state = "special_view_review"
    elif len(candidates) > 1:
        state = "conflicting_signals"
    elif candidates:
        state = "source_supported_candidate"
    else:
        state = "unclassified"
    return {
        "review": state,
        "automaticPostScope": scope,
        "signals": reasons,
        "categoryCandidates": dict(candidates),
        "hashtags": {"wrapped": sorted(wrapped & known), "literal": sorted(literal & known),
                     "wrappedCount": len(wrapped), "literalCount": len(literal),
                     "nonDestinationCount": len(hashtags - FOLDER_TAGS.keys())},
        "attachmentKinds": sorted(k for k, v in post["attachment"].items() if v),
    }


def note_file_use(files, owner, post_id, comment_key=None):
    file_id = str(owner["id"])
    files[file_id][post_id].add(comment_key)


def comment_links(db, posts, cutoff, files):
    counts = Counter()
    for key, raw, digest in source_rows(db, "comments"):
        doc = checked_document(key, raw, digest)
        require(key in posts and doc["source"] == "band" and str(doc["postNo"]) == key,
                f"wrong comment scope for post {key}")
        parents = set()
        replies = set()
        for page in doc["pages"]:
            for top in page["items"]:
                parent = top["comment_id"]
                require(str(top["post_no"]) == key and parent not in parents, f"invalid parent in {key}")
                parents.add(parent)
                check_day(top["created_at"], cutoff, key)
                parent_key = f"post:{key}/comment:{parent}"
                if top.get("file"):
                    note_file_use(files, top["file"], key, parent_key)
                for reply in top.get("latest_comment", []):
                    rk = (parent, reply["comment_id"])
                    require(str(reply["post_no"]) == key and reply["origin_comment_id"] == parent
                            and rk not in replies, f"invalid reply in {key}")
                    replies.add(rk)
                    check_day(reply["created_at"], cutoff, key)
                    if reply.get("file"):
                        note_file_use(files, reply["file"], key, f"{parent_key}/reply:{reply['comment_id']}")
        posts[key]["commentSource"] = {"sha256": digest, "comments": len(parents), "replies": len(replies)}
        counts["comments"] += len(parents)
        counts["replies"] += len(replies)
    return counts


def attachment_links(db, posts, cutoff, digests, file_uses):
    listing = read_index("photo-list-index.json", digests)
    require(listing["complete"] and listing["daily"]["timeZone"] == SEOUL.key
            and listing["daily"]["coveredThrough"] == cutoff.isoformat(), "photo checkpoint differs")
    photos = listing["photos"]
    media = read_index("media-index.json", digests)["photos"]
    require(photos.keys() == media.keys(), "photo list and media index keys differ")
    orphan = []
    totals = defaultdict(Counter)

    def record(kind, asset_id, post_id, status, association):
        entry = {"kind": kind, "id": asset_id, "status": status}
        totals[kind][status] += 1
        if post_id in posts:
            posts[post_id]["media"].append(entry)
        else:
            orphan.append({**entry, "sourcePostId": post_id or None, "association": association})

    for photo_no, row in sorted(photos.items()):
        require(str(row["photo_no"]) == photo_no, f"photo number mismatch: {photo_no}")
        check_day(row["created_at"], cutoff, photo_no)
        post_id = str(row.get("post_no", ""))
        association = "photo_only" if not post_id and row.get("source") == "photo" else "post_not_in_backup"
        record("photo", photo_no, post_id, media[photo_no]["status"], association)

    files = read_index("files-index.json", digests)
    require(files["complete"] and files["daily"]["timeZone"] == SEOUL.key
            and files["daily"]["coveredThrough"] == cutoff.isoformat(), "file checkpoint differs")
    require(file_uses.keys() <= files["files"].keys(), "file reference missing from the source file index")
    for file_id, item in sorted(files["files"].items()):
        meta = item["sourceData"]
        require(str(meta["file_id"]) == file_id, f"file ID mismatch: {file_id}")
        check_day(meta["created_at"], cutoff, file_id)
        # The file catalogue gives the discussion's post number even for a comment attachment.
        # Use direct references in the post/comment body to identify its actual owners.
        entry = {"kind": "file", "id": file_id, "status": item["status"]}
        totals["file"][item["status"]] += 1
        uses = file_uses.get(file_id, {})
        if not uses:
            orphan.append({**entry, "sourcePostId": str(meta.get("post_no") or "") or None,
                           "association": "file_owner_not_in_backup"})
        for post_id, targets in uses.items():
            if None in targets:
                posts[post_id]["media"].append(entry)
            comment_keys = sorted(target for target in targets if target is not None)
            if comment_keys:
                posts[post_id]["commentMedia"].append({**entry, "sourceCommentKeys": comment_keys})

    for asset_id, raw in db.execute(
        "SELECT source_id,metadata_json FROM assets WHERE source='band' AND container_id=? "
        "AND source_id LIKE 'video:%' ORDER BY source_id", (BAND_ID,)
    ):
        meta = json.loads(raw)
        require(f"video:{meta['videoId']}" == asset_id, f"video ID mismatch: {asset_id}")
        record("video", str(meta["videoId"]), str(meta["postNo"]), meta["status"], "post_not_in_backup")
    return orphan, dict(totals)


def tag_stats(rows):
    frequency = defaultdict(Counter)
    counts = Counter()
    for row in rows:
        tags = row["hashtags"]
        wrapped, literal = set(tags["wrapped"]), set(tags["literal"])
        for tag in wrapped | literal:
            for origin, present in (("posts", True), ("wrapped", tag in wrapped), ("literal", tag in literal)):
                frequency[tag][origin] += present
        destinations = {FOLDER_TAGS[tag] for tag in (wrapped | literal) & FOLDER_TAGS.keys()}
        counts["wrappedPosts"] += bool(tags["wrappedCount"])
        counts["literalPosts"] += bool(tags["literalCount"])
        counts["taggedPosts"] += bool(tags["wrappedCount"] or tags["literalCount"])
        counts["withDestinationTag"] += bool(destinations)
        counts["withConflictingDestinationTags"] += len(destinations) > 1
        counts["withOnlyNonDestinationTags"] += bool(tags["nonDestinationCount"]) and not destinations
    return {"posts": counts, "knownTagFrequency": dict(sorted(frequency.items()))}


def prepare(cutoff):
    digests = {}
    index = read_index("index.json", digests)
    require(index["source"] == "https://band.us/@dkom" and str(index["bandNo"]) == BAND_ID
            and index["complete"] and index["daily"]["timeZone"] == SEOUL.key
            and index["daily"]["coveredThrough"] == cutoff.isoformat(), "BAND snapshot scope or cutoff differs")
    posts = {}
    file_uses = defaultdict(lambda: defaultdict(set))
    announcements = []
    with sqlite3.connect((ROOT / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        db.execute("BEGIN")
        checkpoint = db.execute("SELECT checkpoint_json FROM sources WHERE source='band' AND container_id=?",
                                (BAND_ID,)).fetchone()
        require(checkpoint and json.loads(checkpoint[0]) == index, "SQLite checkpoint and local index differ")
        for key, raw, digest in source_rows(db, "post"):
            doc = checked_document(key, raw, digest)
            post = doc["sourceData"]
            require(doc["source"] == "band" and str(doc["bandNo"]) == str(post["band"]["band_no"]) == BAND_ID
                    and str(doc["postId"]) == str(post["post_no"]) == key and index["posts"][key]["sha256"] == digest,
                    f"invalid post identity or snapshot digest: {key}")
            check_day(post["created_at"], cutoff, key)
            for file in post["attachment"].get("file", []):
                note_file_use(file_uses, file, key)
            posts[key] = {"sourceId": key, "sha256": digest, **classify(post),
                          "authorSource": {"bandUserNo": str(post["author"]["user_no"]),
                                           "deletedInBand": bool(post["author"].get("is_deleted"))},
                          "commentSource": None, "media": [], "commentMedia": []}
        require(posts.keys() == index["posts"].keys(), "SQLite and index post IDs differ")
        for key, raw, digest in source_rows(db, "announcement"):
            doc = checked_document(key, raw, digest)
            require(str(doc["band"]["band_no"]) == BAND_ID and str(doc["announcement_id"]) == key,
                    f"invalid announcement identity: {key}")
            check_day(doc["created_at"], cutoff, key)
            announcements.append({"sourceId": key, "sha256": digest, "appId": doc.get("app_id"),
                                  "declaredComments": doc["comment_count"], **classify_announcement(doc)})
        require({v["sourceId"] for v in announcements} == set(index["announcementIds"]), "announcement IDs differ")
        comments = comment_links(db, posts, cutoff, file_uses)
        orphan, media_totals = attachment_links(db, posts, cutoff, digests, file_uses)
    return {
        "schemaVersion": 1, "source": "band", "containerId": BAND_ID, "throughDay": cutoff.isoformat(),
        "timeZone": SEOUL.key, "sourceIndexSha256": digests,
        "authorPolicy": "실명 표시 여부는 별도로 검토한다. bandUserNo는 밴드 안에서만 사용하는 조회 키다.",
        "sourceKeys": {"posts": "source_items(kind=post,source_id)",
                       "announcements": "source_items(kind=announcement,source_id=announcement_id)",
                       "comments": "source_items(kind=comments,source_id=post_no)",
                       "photo": "photo-list-index.photos[photo_no] and media-index.photos[photo_no]",
                       "file": "files-index.files[file_id]", "video": "assets.source_id=video:<videoId>"},
        "summary": {"posts": len(posts), **comments, "announcements": len(announcements),
                    "announcementDispositions": Counter(row["disposition"] for row in announcements),
                    "automaticPostScope": Counter(r["automaticPostScope"] for r in posts.values()
                                                  if r["automaticPostScope"]),
                    "reviewStates": Counter(r["review"] for r in posts.values()),
                    "candidateCategories": Counter(key for r in posts.values() for key in r["categoryCandidates"]),
                    "hashtagAudit": tag_stats(posts.values()),
                    "media": media_totals,
                    "unlinkedMedia": Counter(row["association"] for row in orphan)},
        "posts": list(posts.values()), "announcements": announcements, "unlinkedMedia": orphan,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--through", required=True, type=date.fromisoformat, help="Completed Asia/Seoul backup day")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--review-bodies", action="store_true",
                        help="Write separate body-evidence candidates for the still unclassified posts")
    action.add_argument("--decide-destinations", action="store_true",
                        help="Write development destinations under the ordinary BAND feed policy")
    args = parser.parse_args()
    result = prepare(args.through)
    directory = ROOT / "migration" / f"band-{args.through.isoformat()}"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / "classification.json"
    if args.review_bodies or args.decide_destinations:
        from lib.band_body_review import destination_decisions, review

        classified = target.read_bytes()
        if json.loads(classified) != result:
            raise ValueError("Saved classification differs from current source snapshot; regenerate it first")
        post_text = (directory / "posts.json").read_bytes()
        posts = json.loads(post_text)
        require(posts["throughKst"] == result["throughDay"], "body review cutoff differs")
        hashes = {"classification": sha256(classified), "posts": sha256(post_text)}
        if args.review_bodies:
            result = review(result, posts, hashes)
            target = directory / "body-review.json"
        else:
            reviewed_file = ROOT / "migration" / f"band-{BAND_ID}-reviewed-destinations.json"
            reviewed_bytes = reviewed_file.read_bytes()
            reviewed = json.loads(reviewed_bytes)
            require(reviewed["source"] == "band" and reviewed["containerId"] == BAND_ID,
                    "Reviewed destinations belong to a different source")
            entries = {r["sourceId"]: r for r in reviewed["posts"]}
            require(len(entries) == len(reviewed["posts"]), "Duplicate post IDs in reviewed destinations")
            for key, entry in entries.items():
                excluded = entry.get("exclusionReason")
                name = entry.get("confirmedAuthorName")
                require(key.isdecimal() and re.fullmatch(r"[a-f0-9]{64}", entry["sha256"])
                        and (entry["categoryName"] is None or entry["categoryName"] in FOLDER_TAGS.values())
                        and excluded in (None, "reviewed_join_greeting", "reviewed_private_conversation", "reviewed_album_creation_notice",
                                         "reviewed_platform_notice")
                        and (excluded is None or entry["categoryName"] is None and not entry.get("publicationHold"))
                        and (name is None or (entry["categoryName"] is not None and isinstance(name, str)
                             and 0 < len(name) <= 500 and name.strip() == name and name.isprintable()))
                        and entry.get("publicationHold") in (None, "body:credential_review", "body:personal_data_review"),
                        f"Invalid reviewed destination for post {key}")
            hashes["reviewedDestinations"] = sha256(reviewed_bytes)
            result = destination_decisions(result, posts, hashes, entries)
            target = directory / "classification-decisions.json"
    data = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
        temporary = Path(tmp.name)
        try:
            tmp.write(data)
            tmp.flush()
            os.fsync(tmp.fileno())
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
    print(json.dumps({"path": str(target.relative_to(ROOT)), "sha256": sha256(data),
                      **result["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
