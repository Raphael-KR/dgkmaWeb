"""Detect BAND's tagged text and literal hashtags without treating URL fragments as tags."""
from html import unescape
import re
import unicodedata

FOLDER_TAGS = {
    "부고": "obituary", "부음": "obituary", "동문본인상": "obituary", "訃告": "obituary",
    "경사": "celebration", "결혼": "celebration", "개원": "celebration",
    "공지": "notice", "공지사항": "notice", "동문회공지": "notice",
    "행사": "event", "행사안내": "event", "동문회행사": "event",
    "소식": "news", "뉴스": "news", "동문회소식": "news", "동문소식": "news",
    "동문동정": "news", "모교소식": "news",
    "자유": "free", "자유게시판": "free", "좋은글": "free",
}
# These recognisable topics do not alone identify a destination.
TOPIC_TAGS = {"가입인사", "알림", "안내", "홍보", "동문회역사", "기부", "동영상", "광고", "회칙", "감사", "감사인사"}
BAND_TAG = re.compile(r"<band:hashtag>(.*?)</band:hashtag>", re.IGNORECASE | re.DOTALL)
BAND_REFER = re.compile(r"</?band:refer\b[^<>]*>", re.IGNORECASE)
WEB_URL = re.compile(r"(?:https?://|www\.)[^\s<>\"']+|(?<![\w/])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s<>\"']*)", re.I)
TAG_WORD = re.compile(r"#([^\W]+)", re.UNICODE)


def normalize(value):
    return unicodedata.normalize("NFKC", unescape(value))


def source_tags(raw):
    # Split raw BAND markup before unescaping so quoted literal markup stays literal.
    wrapped_values = BAND_TAG.findall(raw)
    wrapped = set()
    for value in wrapped_values:
        normalized = normalize(value)
        found = TAG_WORD.findall(normalized)
        if found:
            wrapped.update(found)
        elif normalized.lstrip("#").strip():
            wrapped.add(normalized.lstrip("#").strip())
    plain = normalize(BAND_REFER.sub("", BAND_TAG.sub(" ", raw)))
    literal = set(TAG_WORD.findall(WEB_URL.sub(" ", plain)))
    return wrapped, literal
