"""Verify the isolated BAND video store's receipt against the selected source inventory."""

from collections import defaultdict
import hashlib
import json
import re


QUEUE_FORMAT = "band-development-video-queue-v1"
RECEIPT_FORMAT = "band-development-video-receipt-v2"


def group_candidates(assets, originals):
    groups = defaultdict(list)
    seen = set()
    for row in assets.get("videoCandidates", []):
        parent = row["parent"]
        pid, vid = parent["id"], row["sourceId"]
        if (parent["type"] != "post" or pid not in originals or row["contentType"] != "video/mp4"
                or row["bytes"] <= 0 or not re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
                or originals[pid][0].get(("video", vid)) != row["position"]
                or (pid, vid) in seen):
            raise ValueError(f"Invalid video candidate/source association for {pid}/{vid}")
        groups[pid].append(row)
        seen.add((pid, vid))
    return groups


def uploaded_video_receipt(path, through, band, selected, queue_digest):
    if not path.exists():
        return None if selected else {}
    raw = path.read_bytes()
    receipt = json.loads(raw)
    if (receipt.get("format") != RECEIPT_FORMAT or receipt.get("environment") != "development"
            or receipt.get("containerId") != band or receipt.get("throughKst") != through
            or receipt.get("sourceQueueSha256") != queue_digest):
        raise ValueError("Video receipt scope, format or queue digest differs")
    expected = {(pid, row["sourceId"]): (row["sha256"], row["bytes"], row["position"], row["contentType"])
                for pid, rows in selected.items() for row in rows}
    matched = set()
    for row in receipt["videos"]:
        key = (row["sourcePostId"], row["sourceVideoId"])
        actual = (row["sha256"], row["size"], row["position"], row["contentType"])
        if key in matched or expected.get(key) != actual or not valid_object_version(row):
            raise ValueError(f"Unverified or unexpected development video for {key}")
        matched.add(key)
    if matched != set(expected):
        raise ValueError(f"Video receipt incomplete. Expected {len(expected)}, matched {len(matched)}")
    catalogs = {}
    for row in receipt["catalogs"]:
        pid = row["sourcePostId"]
        if pid in catalogs or not valid_object_version(row) or not re.fullmatch(r"[0-9a-f]{64}", row["sha256"]):
            raise ValueError(f"Invalid development catalog receipt for {pid}")
        catalogs[pid] = row["sha256"]
    if catalogs.keys() != selected.keys():
        raise ValueError(f"Video catalog receipt incomplete. Expected {len(selected)}, actual {len(catalogs)}")
    return {"sha256": hashlib.sha256(raw).hexdigest(), "catalogs": len(catalogs), "videos": len(matched)}


def valid_object_version(row):
    return all(re.fullmatch(r"[1-9]\d*", str(row.get(k, ""))) for k in ("generation", "metageneration"))
