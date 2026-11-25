"""Apply a source-bound publication decision to one held BAND post."""

from collections import defaultdict
from hashlib import file_digest, sha256
import json
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .band_source_text import URL, url_status


def check(condition, message):
    if not condition:
        raise ValueError(message)


HOLDS = {
    "omit-expired-files": "media:source-expired",
    "mask-article": "body:personal_data_review",
    "publish-notice": "body:personal_data_review",
    "omit-signup-form": "native_feature:signup",
    "omit-unavailable-photos": "media:source-failed",
    "link-shared-page": "native_feature:shared_page_post_snippet",
    "link-shared-post": "native_feature:shared_post_snippet",
    "include-venue": "native_feature:location",
    "link-native-album": "native_feature:photo_album",
    "strip-reviewed-query": "body:url-review",
    "publish-reviewed-source": "body:personal_data_review",
    "publish-reviewed-notice": "body:credential_review",
    "publish-copy-disabled": "body:restricted",
    "omit-survey": "native_feature:survey",
    "publish-poll-summary": "native_feature:poll_v2",
    "replace-oversized-jpeg": "media:attachment-size-outside-limit",
    "archive-only": None,
}

ARCHIVE_REASONS = {
    "officer_directory_superseded", "officer_directory_heritage_only",
    "shared_source_unavailable", "documents_reserved_for_heritage",
}


def load_reviews(path, band, cutoff, classes, destinations, asset_plan):
    if not path.exists():
        return {}, None
    raw = path.read_bytes()
    doc = json.loads(raw)
    check((doc["format"], doc["containerId"], doc["throughKst"]) ==
          ("band-post-content-decisions-v1", band, cutoff), "Content review scope differs")
    reviews = {}
    for row in doc["posts"]:
        sid = row["sourceId"]
        check(sid not in reviews and row["action"] in HOLDS and sid in classes
              and classes[sid]["sha256"] == row["sourceSha256"]
              and destinations.get(sid, {}).get("action") == "publish",
              f"Content review does not match a publishable source: {sid}")
        reviews[sid] = row

    for sid, row in reviews.items():
        action = row["action"]
        if action in ("omit-expired-files", "omit-unavailable-photos"):
            kind, reason, field = (("file", "source-expired", "fileIds") if action == "omit-expired-files"
                                   else ("photo", "source-failed", "photoIds"))
            expired = {r["sourceId"] for r in asset_plan["held"] if r["kind"] == kind
                       and r["reason"] == reason
                       and any(p["type"] == "post" and p["id"] == sid for p in r["parents"])}
            check(expired and sorted(expired) == sorted(row[field]), f"Missing source inventory differs: {sid}")
            if action == "omit-unavailable-photos":
                check(row["originResults"] == [[key, 404, 404] for key in sorted(expired)],
                      f"Original and thumbnail evidence differs: {sid}")
        elif action == "mask-article":
            photos = []
            for item in asset_plan["candidates"]:
                parent = item["parent"]
                if (parent["id"] if parent["type"] == "post" else parent["postId"]) == sid:
                    check(item["destination"] == "image", f"Article has an unreviewed attachment type: {sid}")
                    photos.append(item["sha256"])
            check(sorted(photos) == sorted(row["reviewedImageSha256"])
                  and classes[sid]["commentSource"]["sha256"] == row["commentSourceSha256"],
                  f"Article or comment media changed after review: {sid}")
        elif action == "omit-signup-form":
            check("signup" in classes[sid]["attachmentKinds"], f"No signup on reviewed source: {sid}")
        elif action == "archive-only":
            check(row["reason"] in ARCHIVE_REASONS, f"Missing archive disposition reason: {sid}")
        elif action == "publish-copy-disabled":
            missing = {r["sourceId"] for r in asset_plan["held"] if r["kind"] == "photo"
                       and r["reason"] == "source-restricted"
                       and any(p["type"] == "post" and p["id"] == sid for p in r.get("parents", []))}
            check(missing == set(row.get("unavailablePhotos", [])), f"Restricted photo inventory differs: {sid}")
        if "categoryName" in row:
            check(action == "publish-reviewed-source" and row["categoryName"] == "celebration"
                  and row.get("titlePrefix") == "[개원]", f"Unexpected reviewed destination: {sid}")
    return reviews, sha256(raw).hexdigest()


def shared_url(card, page):
    source = card["source_post"]
    group, post = str(card["band"]["band_no"]), str(card["post_no"])
    expected = f"https://band.us/{'page' if page else 'band'}/{group}/post/{post}"
    check(group.isdecimal() and post.isdecimal() and not card["is_source_post_unavailable"]
          and not card["is_source_post_restricted"] and source["is_restricted"] is False
          and source["is_shareable"] is True and source["copiable_state"] in ("unassigned", "enabled")
          and str(source["band"]["band_no"]) == group and str(source["post_no"]) == post
          and source["web_url"] == expected, "Shared post evidence does not match its URL")
    return expected


def reviewed_query(text, review):
    """Remove a single reviewed numeric key without relaxing general URL validation."""
    def clean(match):
        original = match[0]
        if sha256(original.encode()).hexdigest() != review["originalUrlSha256"]:
            check(url_status(original) != "review", "Another URL needs review")
            return original
        url = urlsplit(original)
        fields = parse_qsl(url.query, keep_blank_values=True)
        removed = [v for k, v in fields if k.lower() == "sid"]
        check(len(removed) == 1 and re.fullmatch(r"[0-9]+", removed[0]), "Unexpected query field")
        clean_url = urlunsplit(url._replace(query=urlencode([(k, v) for k, v in fields if k.lower() != "sid"])))
        check(url_status(clean_url) == "link" and clean_url == review["publishedUrl"], "Reviewed link changed")
        return clean_url
    return URL.sub(clean, text)


def poll_lines(card):
    """Select only the question, choices, and numerical aggregates from the original card."""
    def label(value):
        check(isinstance(value, str) and value.strip() and
              not any(url_status(m[0]) == "review" for m in URL.finditer(value)), "Invalid poll label")
        return value.strip()

    total = card.get("count")
    total_known = card.get("is_countless") is False and type(total) is int and total >= 0
    lines = [f"투표 · {label(card['title'])}"]
    for subject in card["subjects"]:
        count = subject.get("voter_count")
        show_count = type(count) is int and count >= 0 and (not total_known or count <= total)
        lines.append(f"{label(subject['title'])}" + (f" · {count}표" if show_count else ""))
    if total_known:
        lines.append(f"참여 {total}명")
    return lines


def reviewed_jpegs(folder, reviews, asset_plan, media):
    """Return only explicitly selected JPEG copies of out-of-limit archive attachments."""
    result = {}
    archive = folder.parent.parent
    sources = {(row["kind"], row["sourceId"]): row for row in media["assets"]}
    for sid, review in reviews.items():
        if review["action"] != "replace-oversized-jpeg":
            continue
        row = review["replacement"]
        key = (row["kind"], row["sourceId"])
        source = sources[key]
        source_path = (archive / "band-11089836" / source["file"]).resolve(strict=True)
        target = (archive / row["file"]).resolve(strict=True)
        check(any((r["kind"], r["sourceId"]) == key and r["reason"] == "attachment-size-outside-limit"
                  and r.get("parent", {}).get("type") == "post" and r["parent"]["id"] == sid
                  for r in asset_plan["held"])
              and source_path.is_relative_to(archive / "band-11089836/assets")
              and source["status"] == "saved" and source["verified"]
              and source.get("contentType") in (None, "image/jpeg") and row["contentType"] == "image/jpeg"
              and source["sha256"] == row["inputSha256"]
              and source["bytes"] == source_path.stat().st_size > 5 * 1024 * 1024
              and row["parent"] == {"type": "post", "id": sid}
              and row["destination"] == "image" and row["name"].endswith((".jpg", ".jpeg"))
              and target.parent == folder / "converted/jpeg"
              and target.name == row["sha256"] + ".jpg"
              and 0 < row["bytes"] == target.stat().st_size <= 5 * 1024 * 1024
              and row["originalDimensions"] == row["dimensions"], f"Invalid reviewed JPEG: {sid}")
        for file, expected in ((source_path, row["inputSha256"]), (target, row["sha256"])):
            with file.open("rb") as stream:
                check(file_digest(stream, "sha256").hexdigest() == expected, f"Reviewed JPEG bytes differ: {sid}")
        result[sid] = row
    return result


def masked_article(post, review):
    """Replace only reviewed source spans and check the complete published text."""
    paragraphs = list(post["content"]["content"])
    by_paragraph = defaultdict(list)
    for paragraph, start, end, replacement in review["spans"]:
        check(isinstance(paragraph, int) and 0 <= paragraph < len(paragraphs)
              and type(start) is int and type(end) is int and isinstance(replacement, str),
              "Invalid article mask")
        by_paragraph[paragraph].append((start, end, replacement))
    check(by_paragraph, "Article has no reviewed redactions")
    for index, spans in by_paragraph.items():
        nodes = paragraphs[index].get("content", [])
        check(len(nodes) == 1 and set(nodes[0]) == {"type", "text"} and nodes[0]["type"] == "text",
              "Article markup needs separate review")
        text = nodes[0]["text"]
        pieces = []
        cursor = 0
        for start, end, replacement in sorted(spans):
            check(cursor <= start < end <= len(text), "Article masks overlap or exceed the paragraph")
            pieces.extend((text[cursor:start], replacement))
            cursor = end
        pieces.append(text[cursor:])
        result = "".join(pieces)
        paragraphs[index] = {**paragraphs[index], "content": [{"type": "text", "text": result}] if result else []}
    lines = ["".join(node["text"] for node in p.get("content", [])) for p in paragraphs]
    check(sha256("\n".join(lines).encode()).hexdigest() == review["publishedTextSha256"],
          "Redacted article differs from reviewed publication text")
    title = next(line.strip() for line in lines if line.strip())
    return {**post, "content": {**post["content"], "content": paragraphs},
            "title": title.encode("utf-16-le")[:600].decode("utf-16-le", errors="ignore")}
