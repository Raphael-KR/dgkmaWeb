"""Interpret the visible text and link boundaries shared by BAND posts and comments."""

from html import unescape
import re
from urllib.parse import parse_qsl, urlsplit


WRAPPER = re.compile(r'</?band:hashtag>|<band:refer\s+user_no="\d+">|</band:refer>')
URL = re.compile(r"""https?://[^\s<>"']+""", re.I)
SENSITIVE_QUERY = {
    "access_token", "api_key", "apikey", "authorization", "authkey", "auth_token",
    "cookie", "credential", "expires", "id_token", "key-pair-id", "policy",
    "refresh_token", "sessionid", "sid", "sig", "signature", "token",
}


def visible_band_text(raw):
    # BAND wrappers are markup, whereas encoded angle brackets are user-entered text.
    stripped = WRAPPER.sub("", raw)
    if re.search(r"</?band:", stripped, re.I):
        return None
    return unescape(stripped).replace("\r\n", "\n").replace("\r", "\n")


def url_status(value):
    try:
        url = urlsplit(value)
        keys = [key.lower() for key, _ in parse_qsl(url.query, keep_blank_values=True)]
        if url.username is not None or url.password is not None or any(
            key in SENSITIVE_QUERY or key.startswith(("x-amz-", "x-goog-")) for key in keys
        ):
            return "review"
        if not url.hostname or url.port == 0 or "\\" in value:
            return "text"
        return "link"
    except ValueError:
        return "review"


def text_node(value, href=None):
    node = {"type": "text", "text": value}
    if href:
        node["marks"] = [{"type": "link", "attrs": {
            "href": href, "target": "_blank", "rel": "noopener noreferrer", "class": None,
        }}]
    return node


def paragraph(line):
    nodes = []
    end = 0
    for match in URL.finditer(line):
        href = match[0].rstrip(".,!?;:。")
        while href.endswith(")") and href.count(")") > href.count("("):
            href = href[:-1]
        if url_status(href) != "link":
            continue
        if match.start() > end:
            nodes.append(text_node(line[end:match.start()]))
        nodes.append(text_node(href, href))
        end = match.start() + len(href)
    if end < len(line):
        nodes.append(text_node(line[end:]))
    result = {"type": "paragraph"}
    if nodes:
        result["content"] = nodes
    return result

def body_fields(visible):
    lines = visible.split("\n")
    content = {"type": "doc", "content": [paragraph(line) for line in lines]}
    if "\n".join("".join(n["text"] for n in p.get("content", [])) for p in content["content"]) != visible:
        raise ValueError("Visible BAND text changed during conversion")
    title = next((line.strip() for line in lines if line.strip()), "")
    return {"content": content, "bodyStatus": "converted" if title else "no-source-text",
            "title": title.encode("utf-16-le")[:600].decode("utf-16-le", errors="ignore") if title else None,
            "titleSource": "first-nonempty-line" if title else None}
