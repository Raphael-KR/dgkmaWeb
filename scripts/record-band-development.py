"""Record a verified development receipt against the existing local BAND archive."""
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def target_ids(pairs, expected_keys):
    targets = dict(pairs)
    require(len(targets) == len(pairs) == len(set(targets.values())) and targets.keys() == expected_keys
            and all(type(v) is int and v > 0 for v in targets.values()), "Receipt target IDs differ")
    return targets


def record(receipt_path):
    path = receipt_path.resolve(strict=True)
    require(path.parent.parent == ROOT / "migration", "Expected the receipt in the local BAND snapshot")
    receipt = json.loads(path.read_bytes())
    status = json.loads((path.parent / "manifest-status.json").read_bytes())
    require(receipt["database"] == "heliumdb" and status["environment"] == "development" and
            status["containerId"] == BAND and path.parent.name == "band-" + status["throughKst"],
            "Wrong local or development scope")
    sha = receipt["manifestSha256"]
    require(sha == status["manifestSha256"] and status["manifestFile"] == f"development-manifest-{sha}.json",
            "Verified receipt belongs to a different manifest")
    data = (path.parent / status["manifestFile"]).read_bytes()
    require(sha256(data).hexdigest() == sha, "Manifest bytes changed")
    plan = json.loads(data)
    require(plan["format"] == "band-development-import-v2" and receipt.get("completeBandInventory") is True,
            "Expected a verified full development inventory under the backup-only join policy")
    require((receipt["verifiedPosts"], receipt["verifiedComments"], receipt["verifiedFiles"]) ==
            (len(plan["posts"]), len(plan["comments"]), len(plan["assets"])), "Receipt totals differ")
    posts = target_ids(receipt["posts"], {p["sourceId"] for p in plan["posts"]})
    comments = target_ids(receipt["comments"], {c["sourceKey"] for c in plan["comments"]})
    groups = defaultdict(dict)
    for c in plan["comments"]:
        groups[c["sourcePostId"]][c["sourceKey"]] = comments[c["sourceKey"]]
    classification = (path.parent / "classification.json").read_bytes()
    require(sha256(classification).hexdigest() == status["inputSha256"]["classification"],
            "Source classification changed")
    sources = json.loads(classification)
    fingerprints = {("post", r["sourceId"]): r["sha256"] for r in sources["posts"]}
    fingerprints.update({("comments", r["sourceId"]): r["commentSource"]["sha256"]
                         for r in sources["posts"] if r["commentSource"]})
    fingerprints.update({("announcement", r["sourceId"]): r["sha256"] for r in sources["announcements"]})
    rows = []
    for item in plan["posts"]:
        key = item["sourceId"]
        sid = key
        rows.append(("post", sid, posts[key], item["categoryName"], {}))
        if key in groups:
            rows.append(("comments", sid, posts[key], item["categoryName"], {"commentTargets": groups[key]}))
    with sqlite3.connect((ROOT / "archive.sqlite3").as_uri() + "?mode=rw", uri=True) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        original = {(k, i): h for k, i, h in db.execute("SELECT kind,source_id,raw_sha256 FROM source_items "
                                                         "WHERE source='band' AND container_id=?", (BAND,))}
        # The receipt covers every imported source still in the development database.
        account_reasons = {"author:withdrawn_account", "author:spam_account"}
        join_reasons = {"destination:band_join_notice", "destination:unknown_author_join_notice",
                        "destination:reviewed_join_greeting"}
        backup_only = {}
        for post in status["posts"]:
            if post["state"] == "excluded":
                reason = next((s for s in post["reasons"] if s in account_reasons | join_reasons), None)
                if reason:
                    for kind in ("post", "comments"):
                        backup_only[kind, post["sourceId"]] = reason
        for card in status["announcements"]:
            if card["cardType"] == "join_welcome" and card["state"] == "excluded":
                backup_only["announcement", card["sourceId"]] = "join_backup_only"
        comment_status = {c["sourceKey"]: c for c in status["comments"]}
        require(backup_only.keys().isdisjoint((kind, sid) for kind, sid, *_ in rows),
                "A backup-only source is still in the development receipt")
        retired = 0
        for kind, sid, prior in db.execute("""
            SELECT kind, source_id, detail_json FROM migration_items
            WHERE source='band' AND container_id=? AND target_environment='development' AND status='applied'
            """, (BAND,)).fetchall():
            prior = json.loads(prior)
            reason = backup_only.get((kind, sid))
            if not reason and kind == "comments" and sid not in groups:
                targets = prior.get("commentTargets", {})
                if targets and all(comment_status[k]["state"] == "excluded" and
                                   account_reasons.intersection(comment_status[k]["reasons"]) for k in targets):
                    reason = "author:excluded_comments"
            if not reason:
                continue
            require(prior["sourceSha256"] == original[kind, sid] == fingerprints[kind, sid],
                    f"Archived source changed for {kind}/{sid}")
            detail = {"reason": reason, "sourceSha256": original[kind, sid],
                      "previousReceipt": prior["receipt"], "receipt": str(path.relative_to(ROOT))}
            db.execute("""
                UPDATE migration_items SET status='excluded', target_post_id=NULL, category_name=NULL,
                  applied_content_sha256=NULL, applied_at=NULL, detail_json=?
                WHERE source='band' AND container_id=? AND kind=? AND source_id=? AND target_environment='development'
                """, (json.dumps(detail, separators=(",", ":")), BAND, kind, sid))
            retired += 1
        for kind, sid, target, category, detail in rows:
            require(original.get((kind, sid)) == fingerprints[kind, sid], f"Source changed for {kind}/{sid}")
            detail.update(receipt=str(path.relative_to(ROOT)), manifestSha256=sha, sourceSha256=original[kind, sid])
            result = db.execute("""
                INSERT INTO migration_items (source,container_id,kind,source_id,target_environment,category_name,
                  target_post_id,status,detail_json,applied_content_sha256,applied_at)
                VALUES ('band',?,?,?,'development',?,?,'applied',?,?,?)
                ON CONFLICT(source,container_id,kind,source_id,target_environment) DO UPDATE SET
                  detail_json=excluded.detail_json, applied_content_sha256=excluded.applied_content_sha256,
                  applied_at=excluded.applied_at, status=excluded.status, category_name=excluded.category_name,
                  target_post_id=excluded.target_post_id
                WHERE migration_items.target_post_id=excluded.target_post_id OR migration_items.target_post_id IS NULL
                """, (BAND, kind, sid, category, target, json.dumps(detail, separators=(",", ":")),
                      original[kind, sid], receipt["verifiedAt"]))
            require(result.rowcount == 1, f"Existing target differs for {kind}/{sid}")
    print(json.dumps({"developmentPosts": len(posts), "commentThreads": len(groups),
                      "developmentCommentsAndReplies": len(comments), "retiredMappings": retired}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    record(parser.parse_args().receipt)
