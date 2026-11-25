"""Build a private development import manifest from reviewed BAND backup records."""

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
from tempfile import NamedTemporaryFile
from zoneinfo import ZoneInfo

from lib.band_body_review import automatic_post_scope, retained_comment_attachments
from lib.band_content_review import (
    HOLDS, load_reviews, masked_article, poll_lines, reviewed_jpegs, reviewed_query, shared_url,
)
from lib.band_schedules import schedule_fields
from lib.band_source_text import URL, body_fields, url_status, visible_band_text
from lib.band_post_albums import PostAlbums
from lib.band_video_receipt import QUEUE_FORMAT, group_candidates, uploaded_video_receipt, valid_object_version


ARCHIVE = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"
INPUTS = ("classification", "posts", "comments", "authors", "media", "attachment-candidates")
CATEGORIES = {"notice", "free", "event", "news", "obituary", "celebration"}
OBJECT = re.compile(r"/objects/band-imports/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
ASSET_FIELDS = ("sha256", "name", "contentType", "size")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def keyed(rows, key):
    result = {row[key]: row for row in rows}
    require(len(result) == len(rows), f"Duplicate {key}: {len(rows)} rows, {len(result)} keys")
    return result


def dump(folder, name, payload):
    data = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    with NamedTemporaryFile(dir=folder, delete=False) as out:
        tmp = Path(out.name)
        try:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
            os.replace(tmp, folder / name)
        finally:
            tmp.unlink(missing_ok=True)
    return digest(data)


def snapshot_inputs(folder, through):
    report = json.loads((folder / "readiness.json").read_bytes())
    require(report["throughKst"] == through and report["source"] == "band" and
            report["containerId"] == BAND, "Readiness snapshot does not match BAND/cutoff")
    inputs = {}
    for name in INPUTS:
        data = (folder / f"{name}.json").read_bytes()
        require(digest(data) == report["inputSha256"].get(name), f"Stale readiness input: {name}")
        inputs[name] = json.loads(data)
    return report, inputs


def load_decisions(path, expected_digest, through, classification_hash, classes):
    if path is None:
        require(expected_digest is None, "Decision digest provided without a file")
        return {}
    raw = path.read_bytes()
    require(digest(raw) == expected_digest, f"Decision file digest differs: actual={digest(raw)}")
    payload = json.loads(raw)
    require(payload["source"] == "band" and payload["containerId"] == BAND
            and payload["throughKst"] == through and payload["classificationSha256"] == classification_hash,
            "Decision scope/classification digest differs")
    decisions = keyed(payload["decisions"], "sourceId")
    for sid, row in decisions.items():
        require(sid in classes and row["sha256"] == classes[sid]["sha256"],
                f"Decision/source digest differs for post {sid}")
        require(row["action"] in {"publish", "exclude"} and
                (row.get("categoryName") in CATEGORIES if row["action"] == "publish"
                 else row.get("categoryName") is None), f"Unsupported destination for post {sid}")
        scope = classes[sid]["automaticPostScope"]
        if scope:
            require(row["action"] == "exclude"
                    and row["basis"] == scope, "Automatic post decision conflicts with source scope")
    return decisions


def uploaded_assets(folder, through, queue, queue_digest):
    path = folder / "uploaded-assets.json"
    if not path.exists():
        return {} if not queue else None
    receipt = json.loads(path.read_bytes())
    require(receipt["throughKst"] == through and receipt["containerId"] == BAND
            and receipt["environment"] == "development" and receipt["format"] == "band-development-upload-receipt-v2"
            and receipt["sourceQueueSha256"] == queue_digest, "Receipt scope or upload queue digest differs")
    result = {}
    by_path = {}
    for file in receipt["assets"]:
        meta = {k: file[k] for k in (*ASSET_FIELDS, "objectPath")}
        key = asset_key(meta)
        ref = meta["objectPath"]
        require(OBJECT.fullmatch(ref) and valid_object_version(file) and by_path.get(ref, key) == key and
                key not in result, "Ambiguous or malformed receipt reference")
        result[key] = meta
        by_path[ref] = key
    require(result.keys() == queue.keys(), "Receipt and selected queue contain different file identities")
    return result


def asset_key(row):
    return tuple(row[k] for k in ASSET_FIELDS)


def asset_catalog(plan):
    groups = defaultdict(list)
    for row in plan["candidates"]:
        parent = row["parent"]
        owner = ("post", parent["id"]) if parent["type"] == "post" else ("comment", parent["sourceKey"])
        groups[owner].append(row)
    return groups


def enqueue_files(rows, queue):
    for row in rows:
        item = {"file": row["file"], "size": row["bytes"], "sha256": row["sha256"],
                "name": row["name"], "contentType": row["contentType"]}
        key = asset_key(item)
        if key not in queue:
            path = (ARCHIVE / item["file"]).resolve()
            require(path.is_relative_to(ARCHIVE) and path.is_file(),
                    "A selected attachment is outside the archive or is unavailable")
            with path.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            require(actual == item["sha256"] and path.stat().st_size == item["size"],
                    f"Selected attachment digest/size mismatch: expected {item['sha256']}, actual {actual}")
            queue[key] = item


def resolve_files(rows, receipts):
    return [(row["destination"], receipts[(row["sha256"], row["name"], row["contentType"], row["bytes"])])
            for row in rows]


def serialize_attachments(document, files):
    images, paragraphs = [], []
    for kind, file in files:
        if kind == "image":
            images.append(file["objectPath"])
        else:
            mark = {"type": "link", "attrs": {"href": file["objectPath"], "target": "_blank",
                                               "rel": "noopener noreferrer", "class": None}}
            paragraphs.append({"type": "paragraph", "content": [
                {"type": "text", "text": file["name"], "marks": [mark]}]})
    return {"type": "doc", "content": [*document["content"], *paragraphs]}, images


def source_posts(classes, posts, through, reviews):
    """Compare source bytes, visible paragraphs, attachment order, date, and public identity."""
    data = {}
    later_posts = set()
    next_day = date.fromisoformat(through) + timedelta(days=1)
    cutoff = datetime.combine(next_day, time.min, ZoneInfo("Asia/Seoul")).timestamp() * 1000
    query = ("SELECT source_id,raw_json,raw_sha256 FROM source_items "
             "WHERE source='band' AND container_id=? AND kind='post'")
    with sqlite3.connect((ARCHIVE / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        for sid, raw, sha in db.execute(query, (BAND,)):
            src = json.loads(raw)["sourceData"]
            if sid not in classes:
                require(src["created_at"] >= cutoff and str(src["post_no"]) == sid
                        and str(src["band"]["band_no"]) == BAND and digest(raw.encode()) == sha,
                        f"Unreviewed post within the frozen snapshot: {sid}")
                later_posts.add(sid)
                continue
            require(sid in classes and sid in posts and classes[sid]["sha256"] == sha == digest(raw.encode()),
                    f"Original post scope/hash mismatch for {sid}")
            require(src["created_at"] < cutoff, f"Post outside reviewed cutoff: {sid}")
            prepared = posts[sid]
            origin = prepared["importSource"]
            require(classes[sid]["automaticPostScope"] == automatic_post_scope(src),
                    "Automatic post scope differs from original")
            require(str(src["post_no"]) == sid == origin["sourceId"] and str(src["band"]["band_no"]) == BAND
                    and origin["platform"] == "band" and origin["containerId"] == BAND
                    and src["web_url"] == origin["url"] == f"https://band.us/band/{BAND}/post/{sid}"
                    and round(datetime.fromisoformat(origin["originalCreatedAt"]).timestamp() * 1000)
                    == src["created_at"], f"Original post metadata mismatch: {sid}")
            reasons = set()
            title_excerpt = False
            preview_links = []
            reviewed = reviews.get(sid, {})
            action = reviewed.get("action")
            visible_source = visible_band_text(src["content"]) if isinstance(src["content"], str) else None
            if action == "strip-reviewed-query":
                require(prepared["bodyStatus"] == "url-review" and src["is_restricted"] is False
                        and src["copiable_state"] in ("enabled", "unassigned"), "Unexpected source for URL review")
                cleaned = reviewed_query(visible_source, reviewed)
                require(cleaned != visible_source, f"Reviewed URL absent: {sid}")
                visible_source = cleaned
                prepared.update(body_fields(cleaned))
                prepared.update(schedule_fields(src["attachment"], BAND))
            elif action == "publish-copy-disabled":
                require(prepared["bodyStatus"] == "restricted" and src["is_restricted"] is False
                        and src["copiable_state"] == "disabled" and isinstance(visible_source, str)
                        and not any(url_status(m[0]) == "review" for m in URL.finditer(visible_source)),
                        f"Copy-disabled source is not available for publication: {sid}")
                prepared.update(body_fields(visible_source))
                prepared.update(schedule_fields(src["attachment"], BAND))
            if prepared["bodyStatus"] in ("converted", "no-source-text"):
                schedules = {k: prepared[k] for k in ("scheduleDetails", "scheduleNeedsReview") if k in prepared}
                require(schedules == schedule_fields(src["attachment"], BAND), f"Schedule differs from original: {sid}")
                lines = []
                for para in prepared["content"]["content"]:
                    require(para["type"] == "paragraph", f"Unexpected source paragraph: {sid}")
                    words = []
                    for node in para.get("content", []):
                        require(node["type"] == "text", f"Unexpected source node: {sid}")
                        for mark in node.get("marks", []):
                            href = mark["attrs"]["href"]
                            require(mark["type"] == "link" and re.match(r"^https?://", href, re.I)
                                    and href == node["text"] and url_status(href) == "link",
                                    f"Unexpected source link: {sid}")
                        words.append(node["text"])
                    lines.append("".join(words))
                visible = "\n".join(lines)
                require(visible == visible_source, f"Visible post text differs: {sid}")
                first_line = next((line.strip() for line in lines if line.strip()), "")
                expected_title = first_line.encode("utf-16-le")[:600].decode("utf-16-le", errors="ignore")
                require((prepared["title"] or "") == expected_title, f"Derived title differs: {sid}")
                title_excerpt = first_line != expected_title
                for preview in src["attachment"].get("snippet", []):
                    url = preview.get("url")
                    if url and action == "strip-reviewed-query":
                        url = reviewed_query(url, reviewed)
                    if url and url not in visible and url not in preview_links:
                        if (URL.fullmatch(url) and url_status(url) == "link" and
                                len(url) <= 2048 and not preview.get("authorized_feature")):
                            preview_links.append(url)
                        else:
                            reasons.add("body:preview_link_needs_review")
            native = None
            if action in ("link-shared-page", "link-shared-post"):
                page = action == "link-shared-page"
                kind = "shared_page_post_snippet" if page else "shared_post_snippet"
                url = shared_url(src["attachment"][kind], page)
                if url not in (visible_source or "") and url not in preview_links:
                    preview_links.append(url)
            elif action == "include-venue":
                venue, = src["attachment"]["location"]
                native = " · ".join(venue[k].strip() for k in ("name", "address") if venue[k].strip())
                require(native, f"Venue has no publishable label: {sid}")
            elif action == "link-native-album":
                native = src["attachment"]["photo_album"]
            elif action == "publish-poll-summary":
                poll, = src["attachment"]["poll_v2"]
                native = poll_lines(poll)
            order = {}
            for kind, field in (("photo", "photo_no"), ("file", "id"), ("video", "id")):
                for idx, asset in enumerate(src["attachment"].get(kind, [])):
                    order[(kind, str(asset[field]))] = idx
            source_photos = src["attachment"].get("photo", [])
            restricted = [p for p in source_photos if p.get("is_restricted") is not False
                          or p.get("savable_state") not in ("enabled", "unassigned")]
            if action == "publish-copy-disabled":
                require({str(p["photo_no"]) for p in restricted} == set(reviewed.get("unavailablePhotos", []))
                        and all(p["is_restricted"] is False and p["savable_state"] == "disabled" for p in restricted),
                        f"Source photo access differs: {sid}")
            if restricted:
                reasons.add("media:source-restricted")
            # The BAND photo listing also contains each video's cover. A cover that
            # was not attached as a photo is already represented by its source video.
            video_covers = {str(asset["photo_no"]) for asset in src["attachment"].get("video", [])
                            if asset.get("photo_no") and ("photo", str(asset["photo_no"])) not in order}
            data[sid] = (order, reasons, title_excerpt, video_covers, preview_links, native)
    require(data.keys() == classes.keys() == posts.keys(), "Post inventory differs from original")
    return data, later_posts


def validate_comment_text(classes, comments, later_posts):
    seen = set()
    groups = set()
    missing_authors = set()
    query = ("SELECT source_id,raw_json,raw_sha256 FROM source_items "
             "WHERE source='band' AND container_id=? AND kind='comments'")
    with sqlite3.connect((ARCHIVE / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        for sid, raw, sha in db.execute(query, (BAND,)):
            if sid in later_posts:
                continue
            require(sid in classes and classes[sid]["commentSource"]["sha256"] == sha == digest(raw.encode()),
                    f"Original comment group digest differs: {sid}")
            groups.add(sid)
            for page in json.loads(raw)["pages"]:
                for root in page["items"]:
                    parent = f"post:{sid}/comment:{root['comment_id']}"
                    entries = [(parent, None, root)]
                    entries.extend((f"{parent}/reply:{r['comment_id']}", parent, r)
                                   for r in root.get("latest_comment", []))
                    for key, above, source in entries:
                        item = comments[key]
                        require(key not in seen and (sid, above) == (item["sourcePostId"], item["parentSourceKey"])
                                and round(datetime.fromisoformat(item["createdAt"]).timestamp() * 1000)
                                == source["created_at"], f"Original comment metadata differs: {key}")
                        require(any(a["kind"] == "sticker" for a in item["attachments"]) == bool(source.get("sticker")),
                                f"Original comment sticker differs: {key}")
                        restricted = any(source.get(flag) for flag in
                                         ("is_secret", "is_restricted", "is_visible_only_to_author"))
                        require(item["sourceRestricted"] == restricted
                                and (not restricted or item["bodyStatus"] == "restricted"),
                                f"Original comment visibility differs: {key}")
                        if item["bodyStatus"] in ("converted", "no-source-text"):
                            require(item["content"] == visible_band_text(source.get("body") or ""),
                                    f"Original visible comment differs: {key}")
                        author = source.get("author") or {}
                        name, account = author.get("name"), author.get("user_no")
                        if (not isinstance(name, str) or not name.strip()) and (type(account) is not int or account <= 0):
                            missing_authors.add(key)
                        seen.add(key)
    require(seen == comments.keys(), "Comment inventory differs from original")
    require(groups == {sid for sid, row in classes.items() if row["commentSource"]},
            "Comment group inventory differs from reviewed snapshot")
    return missing_authors


def verified_byline(source, authors, post_confirmation=None):
    mapped = authors.get(source.get("sourceAuthorKey"), {})
    name = mapped.get("realName") if mapped.get("status") == "verified" else None
    if post_confirmation is not None:
        require(isinstance(post_confirmation, str) and bool(post_confirmation.strip())
                and (name is None or name == post_confirmation),
                f"Invalid or conflicting author confirmation for post {source['sourceId']}")
        name = post_confirmation
    role = mapped.get("historicalRole")
    return f"당시 {role} {name}" if role and name else name


def build(through, decision_file, decision_digest, album_files=None):
    folder = ARCHIVE / "migration" / f"band-{through}"
    review, inputs = snapshot_inputs(folder, through)
    classes = keyed(inputs["classification"]["posts"], "sourceId")
    posts = keyed(inputs["posts"]["posts"], "sourceId")
    comments = keyed(inputs["comments"]["comments"], "sourceKey")
    post_review = keyed(review["posts"], "sourceId")
    comment_review = keyed(review["comments"], "sourceKey")
    require(posts.keys() == post_review.keys() and comments.keys() == comment_review.keys(),
            "Reviewed rows differ from prepared rows")
    decisions = load_decisions(decision_file, decision_digest, through, review["inputSha256"]["classification"], classes)
    asset_plan = inputs["attachment-candidates"]
    if decision_file and review["inputSha256"].get("classification-decisions") is not None:
        require(review["inputSha256"]["classification-decisions"] == decision_digest, "Readiness/destination decisions differ")
    content_reviews, content_review_sha = load_reviews(folder / "reviewed-post-content.json", BAND, through,
                                                       classes, decisions, asset_plan)
    sources, later_posts = source_posts(classes, posts, through, content_reviews)
    missing_authors = validate_comment_text(classes, comments, later_posts)
    jpeg_replacements = reviewed_jpegs(folder, content_reviews, asset_plan, inputs["media"])
    assets = asset_catalog(asset_plan)
    album_media = {r["sourceId"]: r for r in inputs["media"]["assets"] if r["kind"] == "photo"}
    albums = PostAlbums(ARCHIVE, BAND, through, asset_plan, folder / "photo-destinations.json")
    album_proofs, direct_photos = {}, {}
    require(albums.decisions.keys() <= posts.keys(), "Photo decision references an unknown post")
    video_groups = group_candidates(asset_plan, sources)
    selected_videos = {}
    authors = inputs["authors"]["authors"]
    queue, post_states, comment_states = {}, {}, {}
    selected_posts, selected_comments = [], []
    manifest = {"format": "band-development-import-v2", "throughKst": through, "posts": [], "comments": [], "assets": []}

    for sid, post in posts.items():
        decision = decisions.get(sid)
        reviewed_content = content_reviews.get(sid, {})
        action = reviewed_content.get("action")
        exclusion = post_review[sid]["exclusionReason"]
        if exclusion or (decision and decision["action"] == "exclude"):
            reason = exclusion or decision["basis"]
            post_states[sid] = {"sourceId": sid, "state": "excluded",
                                "reasons": [reason if reason.startswith("author:") else "destination:" + reason]}
            continue
        if action == "archive-only":
            post_states[sid] = {"sourceId": sid, "state": "excluded",
                                "reasons": ["destination:" + reviewed_content["reason"]]}
            continue
        flags = set(post_review[sid]["reviewReasons"])
        order, original_flags, title_excerpt, video_covers, preview_links, native = sources[sid]
        flags.update(original_flags)
        if reviewed_content:
            require(HOLDS[action] in flags, f"Reviewed hold is absent: {sid}")
            if action == "omit-expired-files":
                expired = {("file", ref) for ref in reviewed_content["fileIds"]}
                require(expired <= order.keys(), f"Expired file outside original: {sid}")
                order = {ref: pos for ref, pos in order.items() if ref not in expired}
            elif action == "mask-article":
                links = set(preview_links)
                links.update(mark["attrs"]["href"] for p in post["content"]["content"] for node in p.get("content", [])
                             for mark in node.get("marks", []))
                require(sorted(digest(url.encode()) for url in links) == reviewed_content.get("publicLinkSha256", [])
                        and not post.get("scheduleDetails"),
                        f"Article link or embedded data needs review: {sid}")
                post = masked_article(post, reviewed_content)
            flags.remove(HOLDS[action])
        if post.get("scheduleNeedsReview"):
            flags.add("body:schedule_review")
        state = "held"
        if decision is None:
            flags.add("destination:unconfirmed")
        confirmed_name = (decision["confirmedAuthorName"]
                          if decision and post_review[sid]["author"].get("basis") == "post_confirmation" else None)
        name = verified_byline(post, authors, confirmed_name)
        if not name:
            flags.add("author:unverified")
        candidates = [row for row in assets["post", sid]
                      if row["kind"] != "photo" or row["sourceId"] not in video_covers]
        if sid in jpeg_replacements:
            candidates.append(jpeg_replacements[sid])
        videos = video_groups.get(sid, [])
        video_ids = {("video", row["sourceId"]) for row in videos}
        source_video_ids = {key for key in order if key[0] == "video"}
        if source_video_ids and source_video_ids == video_ids:
            flags.discard("media:unsupported-video")
        if source_video_ids != video_ids:
            flags.add("media:video_not_prepared")
        candidate_ids = {(row["kind"], row["sourceId"]) for row in candidates} | video_ids
        photo_ids, album_issue = albums.resolve(sid, order, video_covers)
        photo_review = albums.decision(sid, classes[sid]["sha256"], photo_ids) if photo_ids else None
        album_ids = None
        compared_refs = set(order)
        if action == "omit-unavailable-photos":
            missing = {("photo", key) for key in reviewed_content["photoIds"]}
            require(missing <= compared_refs and not missing & candidate_ids, f"Unavailable photo mismatch: {sid}")
            compared_refs -= missing
        if action == "publish-copy-disabled" and reviewed_content.get("unavailablePhotos"):
            missing = {("photo", key) for key in reviewed_content["unavailablePhotos"]}
            require(missing <= compared_refs and not missing & candidate_ids, f"Restricted photo availability changed: {sid}")
            compared_refs -= missing
            flags.remove("media:source-restricted")
        if photo_ids is not None:
            if album_issue:
                flags.add(album_issue)
            elif not photo_review:
                flags.add("media:photo_destination_unreviewed")
            else:
                candidates = [row for row in candidates if row["kind"] != "photo"]
                compared_refs = {ref for ref in compared_refs if ref[0] != "photo"}
                candidate_ids = {ref for ref in candidate_ids if ref[0] != "photo"}
                flags.discard("media:post-has-over-40-images")
                if photo_review["destination"] == "heritage":
                    album_ids = photo_ids
                else:
                    order = {**order, **{("photo", key): n for n, key in enumerate(photo_ids)}}
                    candidates.extend(albums.files[sid][key] for key in photo_ids)
                    compared_refs.update(("photo", key) for key in photo_ids)
                    candidate_ids.update(("photo", key) for key in photo_ids)
                    direct_photos[sid] = len(photo_ids)
        if action == "link-native-album":
            require(not album_issue and photo_ids is None, f"Conflicting photo destinations: {sid}")
            album_ids = albums.native_photos(sid, native, reviewed_content, [key for kind, key in order if kind == "photo"],
                                              album_media, post.get("scheduleDetails", []))
            candidates = [row for row in candidates if row["kind"] != "photo"]
            candidate_ids = {ref for ref in candidate_ids if ref[0] != "photo"}
            compared_refs = {ref for ref in compared_refs if ref[0] != "photo"}
        # Missing/rejected source media already have their specific audit reason.
        if candidate_ids != compared_refs and not any(r.startswith("media:") for r in flags):
            flags.add("media:source_post_references_differ")
        if ((len(candidates) > 40 and sid not in direct_photos)
                or sum(r["destination"] == "document" for r in candidates) > 5):
            flags.add("media:post_attachment_limit")
        # The app trims titles; a 300-unit excerpt can end on a space inside the original line.
        title = (post["title"] or "").strip()
        if post["bodyStatus"] == "no-source-text" and (order or album_ids) and candidate_ids == compared_refs and not album_issue:
            counts = Counter(kind for kind, _ in order)
            if photo_ids:
                counts["photo"] = len(photo_ids)
            title = " · ".join(f"{label} {counts[kind]}{unit}" for kind, label, unit in
                               (("photo", "사진", "장"), ("video", "영상", "개"), ("file", "파일", "개"))
                               if counts[kind])
            flags.discard("body:no-source-text")
        schedules = post.get("scheduleDetails", [])
        if schedules and post["bodyStatus"] == "no-source-text":
            title = schedules[0]["title"].encode("utf-16-le")[:600].decode("utf-16-le", errors="ignore").strip()
            flags.discard("body:no-source-text")
        if reviewed_content.get("titlePrefix"):
            title = (reviewed_content["titlePrefix"] + " " + title).encode("utf-16-le")[:600].decode(
                "utf-16-le", errors="ignore").strip()
        if not flags:
            require(title and post["content"] and post["bodyStatus"] in ("converted", "no-source-text"),
                    f"Missing reviewed body/title for {sid}")
            content = {"type": "doc", "content": list(post["content"]["content"])}
            for url in preview_links:
                link = {"type": "link", "attrs": {"href": url, "target": "_blank",
                                                  "rel": "noopener noreferrer", "class": None}}
                content["content"].append({"type": "paragraph", "content": [
                    {"type": "text", "text": url, "marks": [link]}]})
            for schedule in schedules:
                for label, field in (("일정", "title"), ("일시", "period"), ("장소", "venue")):
                    if schedule[field]:
                        content["content"].append({"type": "paragraph", "content": [
                            {"type": "text", "text": f"{label} · {schedule[field]}"}]})
            if action == "include-venue":
                content["content"].append({"type": "paragraph", "content": [{"type": "text", "text": f"장소 · {native}"}]})
            elif action == "publish-poll-summary":
                content["content"].extend({"type": "paragraph", "content": [{"type": "text", "text": line}]}
                                          for line in native)
            if album_ids:
                if action == "link-native-album" and reviewed_content.get("existingPostId"):
                    owner, proof = reviewed_content["existingPostId"], reviewed_content["existingAlbumSha256"]
                    albums.link(owner, content)
                    albums.reused.append((owner, album_ids, proof))
                    album_proofs[sid] = proof
                else:
                    album_proofs[sid] = albums.add(sid, native["name"] if action == "link-native-album" else title,
                                                  post["importSource"]["originalCreatedAt"], album_ids, content,
                                                  reviewed_content["eventDay"] if action == "link-native-album" else None)
            candidates = sorted(candidates, key=lambda a: (a["kind"], order[a["kind"], a["sourceId"]]))
            enqueue_files(candidates, queue)
            if videos:
                selected_videos[sid] = videos
            category = reviewed_content.get("categoryName", decision["categoryName"])
            selected_posts.append(({**post, "title": title, "content": content}, name, category, candidates))
            state = "selected"
        post_states[sid] = {"sourceId": sid, "state": state, "reasons": sorted(flags)}
        if reviewed_content:
            post_states[sid]["contentReview"] = reviewed_content["action"]
            if reviewed_content.get("unavailablePhotos"):
                post_states[sid]["unavailablePhotos"] = reviewed_content["unavailablePhotos"]
        if photo_ids is not None:
            post_states[sid]["reviewedPhotoCount"] = len(photo_ids)
            post_states[sid]["photoDestination"] = photo_review["destination"] if photo_review else None
        if title_excerpt:
            post_states[sid]["titleNote"] = "first-line-excerpt-at-300-utf16-units-full-body-preserved"
        if video_covers:
            post_states[sid]["videoCoverSourceIds"] = sorted(video_covers)

    for key, comment in sorted(comments.items(), key=lambda pair: bool(pair[1]["parentSourceKey"])):
        sid, parent = comment["sourcePostId"], comment["parentSourceKey"]
        source_state = post_states[sid]["state"]
        if source_state == "excluded":
            if parent:
                require(comment_states[parent]["state"] == "excluded", "Excluded reply has an included parent")
            comment_states[key] = {"sourceKey": key, "state": "excluded",
                                   "reasons": ["parent:post_excluded", *post_states[sid]["reasons"]]}
            continue
        reason = comment_review[key]["exclusionReason"]
        if not reason and key in missing_authors:
            reason = "author:missing"
        if not reason and parent and comment_states[parent]["reasons"][:1] == ["author:missing"]:
            reason = "parent:comment_excluded"
        if reason:
            require(reason in {"media:sticker_only_not_archived", "author:withdrawn_account",
                               "author:spam_account", "author:missing", "parent:comment_excluded"},
                    f"Unexpected comment exclusion: {key}")
            reasons = [reason]
            if reason == "parent:comment_excluded":
                require(parent and comment_states[parent]["state"] == "excluded", "Missing excluded parent")
                reasons.extend(comment_states[parent]["reasons"])
            comment_states[key] = {"sourceKey": key, "state": "excluded", "reasons": reasons}
            continue
        flags = {f for f in comment_review[key]["reviewReasons"] if not f.startswith("parent:")}
        flags.discard("body:length_over_1000")
        name = verified_byline(comment, authors)
        if not name:
            flags.add("author:unverified")
        state = "held"
        if source_state != "selected":
            flags.add("parent:post_" + source_state)
        if parent and comment_states[parent]["state"] != "selected":
            flags.add("parent:comment_" + comment_states[parent]["state"])
        candidates = assets["comment", key]
        attachments = retained_comment_attachments(comment["attachments"])
        order = {}
        photo_position = 0
        for pos, attachment in enumerate(attachments):
            if attachment["kind"] == "photo":
                photo_position += 1
                order["comment-photo", f"{key}/photo:{photo_position}"] = pos
            elif attachment.get("sourceAssetId"):
                order[attachment["kind"], attachment["sourceAssetId"].split(":", 1)[-1]] = pos
        candidates = sorted(candidates, key=lambda row: order.get((row["kind"], row["sourceId"]), len(order)))
        if (len(candidates) != len(attachments) or any((r["kind"], r["sourceId"]) not in order for r in candidates)) and not any(
                r.startswith("media:") for r in flags):
            flags.add("media:source_comment_references_differ")
        if not flags:
            enqueue_files(candidates, queue)
            selected_comments.append((comment, name, candidates))
            state = "selected"
        comment_states[key] = {"sourceKey": key, "state": state, "reasons": sorted(flags)}

    queue_report = {"format": "band-development-upload-queue-v1", "environment": "development",
                    "containerId": BAND, "throughKst": through, "assets": list(queue.values())}
    queue_digest = dump(folder, "upload-queue.json", queue_report)
    video_queue = {"format": QUEUE_FORMAT, "environment": "development", "containerId": BAND,
                   "throughKst": through, "sourceCandidatesSha256": review["inputSha256"]["attachment-candidates"],
                   "postIds": sorted(selected_videos)}
    video_queue_digest = dump(folder, "video-queue.json", video_queue)
    standalone_review_sha = albums.approved_standalone(folder / "reviewed-album-photos.json", album_media, album_proofs)
    catalog_sha = dump(folder, "post-albums.json", albums.catalog())
    if album_files:
        require(album_files.resolve().is_relative_to(folder), "Album staging must remain in the private snapshot")
        albums.stage(album_files)
    videos_receipt = uploaded_video_receipt(folder / "uploaded-videos.json", through, BAND,
                                          selected_videos, video_queue_digest)
    receipts = uploaded_assets(folder, through, queue, queue_digest)
    name = fingerprint = None
    cards = inputs["classification"]["announcements"]
    if selected_posts and receipts is not None and videos_receipt is not None:
        for post, real_name, category, candidates in selected_posts:
            files = resolve_files(candidates, receipts)
            content, images = serialize_attachments(post["content"], files)
            sid = post["sourceId"]
            manifest["posts"].append({"sourceId": sid, "categoryName": category, "title": post["title"],
                "content": content, "imageUrls": images, "verifiedAuthorName": real_name,
                "publishedAt": post["importSource"]["originalCreatedAt"], "importData": post["importSource"],
                **({"albumSha256": album_proofs[sid]} if sid in album_proofs else {})})
            if content_reviews.get(sid, {}).get("existingPostId"):
                manifest["posts"][-1]["linkedAlbumSourceId"] = content_reviews[sid]["existingPostId"]
            if sid in direct_photos:
                manifest["posts"][-1]["reviewedPhotoCount"] = direct_photos[sid]
            post_states[sid]["state"] = "ready"
        for comment, real_name, candidates in selected_comments:
            files = resolve_files(candidates, receipts)
            key = comment["sourceKey"]
            manifest["comments"].append({"sourcePostId": comment["sourcePostId"], "sourceKey": key,
                "parentSourceKey": comment["parentSourceKey"], "verifiedAuthorName": real_name,
                "createdAt": comment["createdAt"], "content": comment["content"],
                **({"attachmentPaths": [file["objectPath"] for _, file in files]}
                   if len(files) > 1 or any(file["contentType"] == "video/mp4" for _, file in files)
                   else {"attachmentPath": files[0][1]["objectPath"] if files else None})})
            content_length = len(comment["content"].encode("utf-16-le")) // 2
            if content_length > 1000:
                manifest["comments"][-1]["originalContentLength"] = content_length
            comment_states[key]["state"] = "ready"
        manifest["assets"] = list(receipts.values())
        encoded = (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        name = f"development-manifest-{digest(encoded)}.json"
        fingerprint = dump(folder, name, manifest)
    summary = {"posts": Counter(s["state"] for s in post_states.values()),
               "commentsAndReplies": Counter(s["state"] for s in comment_states.values()),
               "comments": Counter(row["state"] for key, row in comment_states.items()
                                   if not comments[key]["parentSourceKey"]),
               "replies": Counter(row["state"] for key, row in comment_states.items()
                                  if comments[key]["parentSourceKey"]),
               "selectedUploadFiles": len(queue), "manifestFiles": len(manifest["assets"])}
    summary["awaitingUploadReceipt"] = receipts is None
    summary["selectedVideoPosts"] = len(selected_videos)
    summary["selectedVideos"] = sum(map(len, selected_videos.values()))
    summary["awaitingVideoReceipt"] = videos_receipt is None
    summary["derivedTitleExcerpts"] = sum("titleNote" in row for row in post_states.values())
    card_states = []
    for card in cards:
        disposition = card.get("disposition")
        require(disposition in ("exclude", "unresolved"),
                f"Regenerate announcement classification for card {card['sourceId']}")
        if disposition == "exclude":
            state, reason = "excluded", card["cardType"]
        else:
            state, reason = "held", "destination:unconfirmed"
        card_states.append({**card, "state": state, "reason": reason})
    summary["announcementDispositions"] = Counter(row["disposition"] for row in cards)
    summary["announcementsAwaitingDisposition"] = sum(row["disposition"] == "unresolved" for row in cards)
    # The archive has post-comment threads; card comment counts have no corresponding bodies.
    summary["uncollectedAnnouncementComments"] = sum(row["declaredComments"] for row in cards)
    status = {"source": "band", "containerId": BAND, "throughKst": through, "environment": "development",
              "inputSha256": review["inputSha256"], "classificationDecisionsSha256": decision_digest,
              "postContentDecisionSha256": content_review_sha,
              "manifestFile": name, "manifestSha256": fingerprint, "uploadQueueSha256": queue_digest,
              "videoQueueSha256": video_queue_digest, "videoReceipt": videos_receipt,
              "standaloneAlbumDecisionSha256": standalone_review_sha,
              "postAlbumCatalogSha256": catalog_sha, "postAlbumCount": len(albums.albums),
              "albumPhotoCount": len(albums.entries), "photoDecisionSha256": albums.decision_sha,
              "summary": summary, "posts": list(post_states.values()), "comments": list(comment_states.values()),
              "announcements": card_states}
    dump(folder, "manifest-status.json", status)
    return {"throughKst": through, "manifestSha256": fingerprint, **summary}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--through", required=True, type=date.fromisoformat)
    parser.add_argument("--decisions", type=Path, help="확정된 원본별 게시판 분류 JSON")
    parser.add_argument("--decisions-sha256", help="검토한 분류 결정 파일의 SHA-256")
    parser.add_argument("--album-files", type=Path, help="검증된 앨범 사진을 모을 비공개 로컬 폴더")
    args = parser.parse_args()
    require(args.through < datetime.now(ZoneInfo("Asia/Seoul")).date(), "Backup day has not ended")
    if args.decisions:
        require(args.decisions.resolve().is_relative_to(ARCHIVE), "Decision file must remain inside the private archive")
    print(json.dumps(build(str(args.through), args.decisions, args.decisions_sha256, args.album_files), ensure_ascii=False))
