"""Match a local download receipt to the original BAND comment attachment."""
from hashlib import sha256
import json
from urllib.parse import urlsplit


def read_receipts(folder, post_id):
    path = folder / "comment-media" / (post_id + ".json")
    if not path.exists():
        return {}
    data = json.loads(path.read_bytes())
    if data["format"] != "band-comment-media-v1" or data["postNo"] != post_id:
        raise ValueError(f"Wrong comment attachment receipt for post {post_id}")
    return data["entries"]


def media_entry(receipts, key, url):
    entry = receipts.get(key)
    if entry:
        parts = urlsplit(url)
        ident = sha256((parts.hostname + parts.path).encode()).hexdigest()
        if entry.get("sourceKey") != ident:
            return {"status": "source-changed"}
    return entry
