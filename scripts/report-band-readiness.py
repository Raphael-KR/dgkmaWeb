"""Join local BAND review artefacts by source key; no database writes or upload."""

import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from tempfile import NamedTemporaryFile

from lib.band_body_review import retained_comment_attachments


ARCHIVE = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"
# These native cards still require a separate decision about their contents.
NATIVE_ATTACHMENTS = {
    "location", "photo_album", "poll_v2", "promotion_photo",
    "shared_page_post_snippet", "shared_post_snippet", "signup", "subpost", "survey",
}


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def keyed(rows, column):
    result = {r[column]: r for r in rows}
    require(len(result) == len(rows), f"duplicate {column}: {len(rows)} rows, {len(result)} keys")
    return result


def author_info(key, authors):
    if key is None:
        return {"key": None, "status": "missing"}
    require(key in authors, "source author key lacks a review record")
    info = authors[key]
    verified = info["status"] == "verified"
    require(verified == bool((info.get("realName") or "").strip()), "inconsistent real-name mapping")
    return {"key": key, "status": info["status"]}


def author_state(author):
    return "verified" if author["status"] == "verified" else "unresolved"


def account_exclusion(author, source_key, unknown_without_key):
    if source_key in unknown_without_key:
        return "author:withdrawn_account"
    if author["status"] in {"withdrawn_account", "spam_account"}:
        return "author:" + author["status"]
    return None


def media_reasons(media, candidates, source_hash, posts, comments):
    require(candidates["sourceMediaSha256"] == source_hash, "attachment plan uses a different media audit")
    audit = {(r["kind"], r["sourceId"]): r for r in media["assets"]}
    require(len(audit) == len(media["assets"]), "duplicate media IDs")
    accepted = {(r["kind"], r["sourceId"]) for key in ("candidates", "videoCandidates")
                for r in candidates.get(key, [])}
    held = defaultdict(set)
    for r in candidates["held"]:
        held[r["kind"], r["sourceId"]].add(r["reason"])
    require(accepted | held.keys() == audit.keys(), "attachment plan and source media IDs differ")
    issues = defaultdict(set)
    by_owner = defaultdict(Counter)
    orphan_ids = Counter()
    for key, asset in audit.items():
        owners = []
        for parent in asset["parents"]:
            if parent["type"] == "post":
                if parent["id"] in posts:
                    owners.append(("post", parent["id"]))
                else:
                    require(parent.get("inSnapshot") is False, "media references unknown post")
            if parent["type"] == "comment":
                owner = parent["sourceKey"]
                require(owner in comments and comments[owner]["sourcePostId"] == parent["postId"],
                        "media references unknown or inconsistent comment")
                owners.append(("comment", owner))
        reasons = {"media:" + reason for reason in held.get(key, ())}
        if asset.get("verified") is False:
            reasons.add("media:local_hash_or_size_mismatch")
        if not owners:
            orphan_ids["outside_post_and_comment_rows"] += 1
        for owner in set(owners):
            issues[owner].update(reasons)
            by_owner[owner]["attachedSources"] += 1
            by_owner[owner]["sourceWithCandidate"] += key in accepted
            by_owner[owner]["sourceWithHeldPart"] += key in held
    return issues, by_owner, {"sources": len(audit), "withCandidate": len(accepted),
        "withHeldPart": len(held), "withBoth": len(accepted & held.keys()),
        "withoutPostOrCommentInSnapshot": orphan_ids["outside_post_and_comment_rows"]}


def summarize(rows):
    reasons = Counter()
    combinations = Counter()
    combinations_by_domain = Counter()
    unique = held_rows = excluded = 0
    for row in rows:
        flags = row["reviewReasons"]
        require(len(set(flags)) == len(flags), "duplicate reason on one record")
        unique += 1
        if row["exclusionReason"]:
            excluded += 1
            continue
        reasons.update(flags)
        held_rows += bool(flags)
        combinations[" + ".join(flags) or "none"] += 1
        combinations_by_domain[" + ".join(sorted({v.split(":")[0] for v in flags})) or "none"] += 1
    return {"records": unique, "excluded": excluded, "withReviewReason": held_rows,
            "withoutListedReviewReason": unique - excluded - held_rows,
            "countsByReasonMayOverlap": reasons, "exclusiveReasonCombinations": combinations,
            "exclusiveReasonDomains": combinations_by_domain}


def source_author_key(author):
    uid = (author or {}).get("user_no")
    return hashlib.sha256(f"band:{BAND}:user:{uid}".encode()).hexdigest() if uid else None


def validate_archive(classification, comments, through, folder):
    select = """SELECT source_id, raw_sha256 FROM source_items
                WHERE source='band' AND container_id=? AND kind=?"""
    with sqlite3.connect((ARCHIVE / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        db.execute("BEGIN")
        checkpoint = db.execute("SELECT checkpoint_json FROM sources WHERE source='band' AND container_id=?",
                                (BAND,)).fetchone()
        require(checkpoint is not None, "missing local archive checkpoint")
        snapshot = json.loads(checkpoint[0])
        require(snapshot["daily"]["coveredThrough"] == through and snapshot["daily"]["timeZone"] == "Asia/Seoul",
                "requested completed local archive snapshot differs")
        for kind, key in [("post", "posts"), ("announcement", "announcements")]:
            rows = classification[key]
            actual = dict(db.execute(select, (BAND, kind)))
            require(len(rows) == len(actual) and {r["sourceId"]: r["sha256"] for r in rows} == actual,
                    f"{kind} source classification IDs/digests differ from local archive")
        comment_sources = {r["sourceId"]: r["commentSource"]["sha256"]
                           for r in classification["posts"] if r["commentSource"]}
        require(comment_sources == dict(db.execute(select, (BAND, "comments"))),
                "comment source digest mismatch")
        seen = set()
        for pid, raw in db.execute(
            "SELECT source_id, raw_json FROM source_items WHERE source='band' AND container_id=? AND kind='comments'",
            (BAND,),
        ):
            for page in json.loads(raw)["pages"]:
                for item in page["items"]:
                    parent = f"post:{pid}/comment:{item['comment_id']}"
                    entries = [(parent, None, item)]
                    entries.extend((f"{parent}/reply:{r['comment_id']}", parent, r)
                                   for r in item.get("latest_comment", []))
                    for key, origin, source in entries:
                        record = comments.get(key)
                        require(key not in seen and record and record["sourcePostId"] == pid
                                and record["parentSourceKey"] == origin
                                and record["sourceAuthorKey"] == source_author_key(source.get("author")),
                                "source comment identity/parent/author mismatch")
                        seen.add(key)
        require(seen == comments.keys(), "review comment IDs differ from source")
    for filename, expected in classification["sourceIndexSha256"].items():
        require(Path(filename).name == filename, "invalid index path")
        require(hashlib.sha256((folder / filename).read_bytes()).hexdigest() == expected,
                f"backup index digest differs: {filename}")


def prepare(through):
    directory = ARCHIVE / "migration" / f"band-{through}"
    inputs = {}
    hashes = {}
    for name, date_key in [("classification", "throughDay"), ("posts", "throughKst"), ("comments", "throughKst"),
                           ("authors", "cutoff"), ("media", "throughDay"), ("attachment-candidates", "throughDay")]:
        raw = (directory / f"{name}.json").read_bytes()
        inputs[name] = data = json.loads(raw)
        hashes[name] = hashlib.sha256(raw).hexdigest()
        require(data[date_key] == through and data.get("containerId", BAND) == BAND,
                f"{name} snapshot/container mismatch")
    classification = inputs["classification"]
    classes = keyed(classification["posts"], "sourceId")
    posts = keyed(inputs["posts"]["posts"], "sourceId")
    comments = keyed(inputs["comments"]["comments"], "sourceKey")
    validate_archive(classification, comments, through, ARCHIVE / f"band-{BAND}")
    require(classes.keys() == posts.keys(), "post text and classification IDs differ")
    decision_file = directory / "classification-decisions.json"
    destinations = {}
    if decision_file.exists():
        raw = decision_file.read_bytes()
        policy = json.loads(raw)
        require(policy["source"] == "band" and policy["containerId"] == BAND and policy["throughKst"] == through
                and policy["classificationSha256"] == hashes["classification"] and policy["postsSha256"] == hashes["posts"],
                "destination selection snapshot differs from prepared posts")
        hashes["classification-decisions"] = hashlib.sha256(raw).hexdigest()
        destinations = keyed(policy["decisions"], "sourceId")
        pending = keyed(policy["unresolved"], "sourceId")
        require(not (destinations.keys() & pending.keys()) and destinations.keys() | pending.keys() == posts.keys(),
                "destination selection does not cover each source post exactly once")
        require(all(r["sha256"] == classes[key]["sha256"] for key, r in (destinations | pending).items()),
                "destination selection source digest differs")
    issues, media_counts, media_summary = media_reasons(inputs["media"], inputs["attachment-candidates"],
                                                        hashes["media"], posts, comments)
    authors = inputs["authors"]["authors"]
    unknown_without_key = set(inputs["authors"].get("unknownWithoutKey", []))
    post_rows, comment_rows = {}, {}
    layers, class_and_author, author_totals = Counter(), Counter(), defaultdict(Counter)
    for key, post in posts.items():
        source = post["importSource"]
        require(source["containerId"] == BAND and source["sourceId"] == key and source["platform"] == "band",
                "unexpected post text source")
        cls = classes[key]
        require(source_author_key({"user_no": cls["authorSource"]["bandUserNo"]}) == post["sourceAuthorKey"],
                "source and prepared post author keys differ")
        author = author_info(post["sourceAuthorKey"], authors)
        # Reconcile the account-level roster before applying an individual post confirmation.
        author_totals[author_state(author)]["posts"] += 1
        flags = set(issues["post", key])
        decision = destinations.get(key)
        account_reason = account_exclusion(author, key, unknown_without_key)
        if not account_reason and decision and "confirmedAuthorName" in decision:
            confirmed_name = decision["confirmedAuthorName"]
            require(decision["action"] == "publish" and isinstance(confirmed_name, str)
                    and 0 < len(confirmed_name) <= 500 and confirmed_name == confirmed_name.strip(),
                    f"Invalid author confirmation for post {key}")
            if author_state(author) == "verified" and authors[author["key"]]["realName"] != confirmed_name:
                author["status"] = "conflicting_post_confirmation"
            else:
                author.update(status="verified", basis="post_confirmation")
        if decision and decision.get("publicationHold"):
            flags.add(decision["publicationHold"])
        scope = cls["automaticPostScope"]
        excluded = scope
        if decision and scope:
            require(decision["action"] == "exclude" and decision["basis"] == scope,
                    "automatic post destination differs from its source scope")
        if not decision and not excluded:
            flags.add("destination:unconfirmed")
        elif decision and decision["action"] == "exclude":
            excluded = decision["basis"]
        excluded = excluded or account_reason
        if author_state(author) != "verified":
            flags.add("author:" + author["status"])
        if post["bodyStatus"] != "converted":
            flags.add("body:" + post["bodyStatus"])
        if post.get("scheduleNeedsReview"):
            flags.add("body:schedule_review")
        flags.update("native_feature:" + feature for feature in NATIVE_ATTACHMENTS & post["attachmentCounts"].keys())
        post_rows[key] = {"sourceId": key, "author": author, "classificationReview": cls["review"],
                          "destinationCandidates": sorted(cls["categoryCandidates"]),
                          "selectedDestination": decision.get("categoryName") if decision else None,
                          "bodyStatus": post["bodyStatus"],
                          "media": media_counts["post", key], "exclusionReason": excluded,
                          "reviewReasons": [] if excluded else sorted(flags)}
        class_and_author[cls["review"] + "/" + author_state(author)] += 1

    # Parents are resolved before replies, independent of source paging order.
    counts = defaultdict(Counter)
    for row in sorted(comments.values(), key=lambda x: bool(x["parentSourceKey"])):
        key, post, parent = row["sourceKey"], row["sourcePostId"], row["parentSourceKey"]
        require(post in post_rows and key.startswith(f"post:{post}/comment:"), "comment post relation mismatch")
        if parent:
            require(parent in comment_rows and comment_rows[parent]["sourcePostId"] == post
                    and not comment_rows[parent]["parentSourceKey"] and key.startswith(parent + "/reply:"),
                    "reply parent relation mismatch")
        kind = "replies" if parent else "comments"
        counts[post][kind] += 1
        author = author_info(row["sourceAuthorKey"], authors)
        author_totals[author_state(author)][kind] += 1
        parents = [author_state(post_rows[post]["author"])]
        if parent:
            parents.append(author_state(comment_rows[parent]["author"]))
        layers["/".join([*parents, author_state(author)])] += 1
        flags = set(issues["comment", key])
        if author_state(author) != "verified":
            flags.add("author:" + author["status"])
        if row["bodyStatus"] not in ("converted", "no-source-text"):
            flags.add("body:" + row["bodyStatus"])
        content = row.get("content") or ""
        if len(content.encode("utf-16-le")) // 2 > 1000:
            flags.add("body:length_over_1000")
        attachments = retained_comment_attachments(row["attachments"])
        sticker_only = (bool(row["attachments"]) and not attachments and row["bodyStatus"] == "no-source-text"
                        and not content.strip())
        if not content.strip() and not attachments and not sticker_only:
            flags.add("body:no_text_or_attachment")
        if row["sourceRestricted"]:
            flags.add("body:restricted")
        if post_rows[post]["reviewReasons"]:
            flags.add("parent:post_has_review_reasons")
        if parent and any(not reason.startswith("parent:") for reason in comment_rows[parent]["reviewReasons"]):
            flags.add("parent:comment_has_own_review_reasons")
        if parent and comment_rows[parent]["exclusionReason"]:
            flags.add("parent:comment_excluded")
        excluded = post_rows[post]["exclusionReason"]
        if not excluded:
            excluded = account_exclusion(author, key, unknown_without_key)
        if not excluded and parent and comment_rows[parent]["exclusionReason"] in {
            "author:withdrawn_account", "author:spam_account"
        }:
            excluded = "parent:comment_excluded"
        if not excluded and sticker_only:
            excluded = "media:sticker_only_not_archived"
        comment_rows[key] = {"sourceKey": key, "sourcePostId": post, "parentSourceKey": parent,
                             "author": author, "media": media_counts["comment", key],
                             "exclusionReason": excluded, "reviewReasons": [] if excluded else sorted(flags)}
    for key, source in classes.items():
        ref = source["commentSource"] or {}
        require(all(counts[key][k] == ref.get(k, 0) for k in ("comments", "replies")),
                "per-post comment/reply counts differ from source classification")
    require(all(dict(author_totals[k]) == inputs["authors"]["summary"]["records"][k] for k in author_totals),
            "joined author totals differ from verified roster report")
    top = [r for r in comment_rows.values() if not r["parentSourceKey"]]
    replies = [r for r in comment_rows.values() if r["parentSourceKey"]]
    return {
        "source": "band", "containerId": BAND, "throughKst": through, "stage": "local-review-only",
        "destinationApproval": {"selected": sum(d["action"] == "publish" for d in destinations.values()),
                                "excluded": sum(bool(r["exclusionReason"]) for r in post_rows.values()),
                                "unresolved": sum(k not in destinations and not r["exclusionReason"]
                                                  for k, r in post_rows.items())},
        "inputSha256": hashes,
        "summary": {"posts": summarize(post_rows.values()), "comments": summarize(top), "replies": summarize(replies),
                    "platformAnnouncements": len(classification["announcements"]),
                    "classificationAndAuthor": class_and_author, "authorLayerCounts": layers,
                    "media": media_summary},
        "posts": list(post_rows.values()), "comments": list(comment_rows.values()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--through", required=True, type=date.fromisoformat)
    cutoff = str(parser.parse_args().through)
    result = prepare(cutoff)
    folder = ARCHIVE / "migration" / f"band-{cutoff}"
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=folder, delete=False) as out:
        tmp = Path(out.name)
        try:
            json.dump(result, out, ensure_ascii=False, separators=(",", ":"))
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
            os.replace(tmp, folder / "readiness.json")
        finally:
            tmp.unlink(missing_ok=True)
    summary = result["summary"]
    print(json.dumps({"stage": result["stage"], "destinationApproval": result["destinationApproval"],
                      **{k: {f: summary[k][f] for f in ("records", "excluded", "withReviewReason", "withoutListedReviewReason")}
                         for k in ("posts", "comments", "replies")},
                      "classificationAndAuthor": summary["classificationAndAuthor"],
                      "authorLayerCounts": summary["authorLayerCounts"], "media": summary["media"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
