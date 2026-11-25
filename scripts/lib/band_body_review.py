"""Collect classification evidence from BAND text without deciding its destination."""

from collections import Counter, defaultdict
import hashlib
import re
import unicodedata

from .band_source_text import URL
from .band_hashtags import FOLDER_TAGS


DATE_OR_TIME = re.compile(r"(?:\d{1,2}\s*월\s*\d{1,2}\s*일|\d{2,4}[./-]\d{1,2}[./-]\d{1,2}|"
                          r"\d{1,2}시(?:\s*\d{1,2}분)?|(?:일시|일자|일정)\s*[:：])")
TOPICS = {
    "obituary": r"부고|訃告|부음|별세|본인상|부친상|모친상|빙부상|빙모상|장인상|장모상|발인|빈소",
    "celebration/wedding": r"결혼|婚姻|혼인|화촉|청첩|예식일|예식장",
    "celebration/opening": r"개원|개업식|개업을",
    "notice": r"공지|공고|사무국.{0,8}(?:안내|알림)|회비.{0,8}납부.{0,8}안내",
    "event": r"총회|세미나|학술대회|학술집담회|체육대회|워크숍|워크샵|신년회|송년회|동문회 모임",
    "news": r"모교\s*소식|동문회\s*소식|동문\s*동정|동문\s*소식",
}
TOPICS = {key: re.compile(value) for key, value in TOPICS.items()}
# The unflagged templates use one source line. A sentence, a mention wrapper
# or another field appended by a member must not be swallowed as a name.
BAND_LABEL = r"[^\s.!?<>:\[\]][^\r\n.!?<>:\[\]]*"
LEGACY_JOIN_NOTICE = re.compile(
    rf"(?:{BAND_LABEL}님이 밴드에 가입했습니다\.|{BAND_LABEL}님의 초대로 {BAND_LABEL}님이 가입했습니다\.)"
)
LEGACY_BIRTHDAY = re.compile(
    r'\d{1,2}월 \d{1,2}일(?:\(음력 \d{1,2}월 \d{1,2}일\))?은 '
    r'<band:refer user_no="\d+">[^<>\r\n]+</band:refer>님의 생일입니다\. 축하해주세요!'
)
LEGACY_PROFILE_PHOTO = re.compile(rf"{BAND_LABEL}님이 프로필 사진을 변경했습니다\.")
LEGACY_ALBUM = re.compile(r"\[[^\r\n]+\] 앨범을 만들었습니다\.")


JOIN_GREETING = re.compile(r"가입\s*인사|밴드에\s*가입했습니다|초대로\s*가입하게\s*되었")


def retained_comment_attachments(attachments):
    return [asset for asset in attachments
            if (asset["kind"], asset["status"]) != ("sticker", "not_archived")]


def join_notice_scope(post):
    display_name = (post.get("author") or {}).get("name")
    return "unknown_author_join_notice" if (display_name or "").strip() == "(알 수 없음)" else "band_join_notice"


def automatic_post_scope(post):
    flagged = post.get("is_automatic_posting") is True
    if "is_automatic_posting" in post and not flagged:
        return None
    if flagged and post.get("posting_usage") == "new_member":
        return join_notice_scope(post)
    text = post.get("content") or ""
    view = post.get("view_type")
    if not post.get("posting_usage"):
        if not view:
            if LEGACY_JOIN_NOTICE.fullmatch(text):
                return join_notice_scope(post)
            attachments = post["attachment"]
            if (attachments.get("promotion_photo") and LEGACY_PROFILE_PHOTO.fullmatch(text)
                    or attachments.get("photo_album") and LEGACY_ALBUM.fullmatch(text)):
                return "other_automatic_post"
        elif view == "birthday" and LEGACY_BIRTHDAY.fullmatch(text):
            return "other_automatic_post"
    return "other_automatic_post" if flagged else None


def clean_lines(visible):
    # The duplicate comparison retains URLs. Remove URLs only for semantic matching.
    return [line.strip() for line in URL.sub("", unicodedata.normalize("NFKC", visible)).splitlines()
            if line.strip()]


def assess(visible):
    lines = clean_lines(visible)
    body = "\n".join(lines)
    head = " ".join(lines[:3])[:220]
    first = lines[0][:110] if lines else ""
    topics = {key for key, pattern in TOPICS.items() if pattern.search(body)}
    evidence = {}
    when = bool(DATE_OR_TIME.search(body))
    where = bool(re.search(r"(?:장\s*소|주\s*소|오시는\s*길)\s*[:：]|예식장|웨딩홀|컨벤션|호텔|강당|"
                           r"강의실|세미나실|회의실|한의학관|회관|연회장", body))
    invite = bool(re.search(r"모십니다|초대(?:합니다|드립니다)|초청합니다|(?:참석|참여).{0,9}(?:부탁|바랍니다|해\s*주시)|"
                            r"신청.{0,6}(?:기간|방법|바랍니다)|참가자를\s*모집", body))
    retrospective = bool(re.search(r"(?:마쳤|마무리했|다녀왔|다녀온|후기|참석해\s*주셔서|"
                                   r"참석해\s*주신|축하해\s*주신|열렸습니다|개최되었습니다)", head))
    guide = bool(re.search(r"가이드|매뉴얼|이용\s*방법|문구\s*예시|지원\s*규정|"
                           r"경조사\s*지원|양식\s*(?:안내|예시)|연간\s*계획|사업\s*계획", head))

    funeral_fields = [label for label, pattern in (
        ("funeral_venue", r"빈소|장례식장"), ("departure", r"발인"), ("burial_place", r"장지"),
        ("bereaved", r"상주\s*[:：]"), ("condolence_account", r"부의금|조의금|마음\s*전하실"),
    ) if re.search(pattern, body)]
    if (TOPICS["obituary"].search(head) and len(funeral_fields) >= 2 and not guide
            and not re.search(r"조문.{0,5}(?:답례|감사)|장례.{0,9}(?:마치고|마쳤)|부고.{0,4}철회", head)):
        evidence["obituary"] = ["notice_in_opening_lines", *funeral_fields]
    wedding_venue = bool(re.search(r"웨딩|예식장|컨벤션|호텔|성당|교회|예식\s*장소", body))
    parties = bool(re.search(r"신랑|신부|혼주|자녀|자제|장녀|장남|차녀|차남|(?:동문|원장).{0,12}(?:결혼|혼인)", body))
    if (TOPICS["celebration/wedding"].search(head) and when and wedding_venue and (parties or invite)
            and not guide and not retrospective):
        evidence["celebration/wedding"] = ["wedding_in_opening_lines", "date_or_time", "venue",
                                          "parties" if parties else "invitation"]
    if (TOPICS["celebration/opening"].search(head) and re.search(r"한의원|한방병원", body)
            and when and where and not guide and not retrospective):
        evidence["celebration/opening"] = ["opening_in_first_lines", "clinic", "date_or_time", "location"]
    event_agenda = bool(re.search(r"행사\s*안내|(?:총회|세미나|대회|워크[숍샵]|신년회|송년회)\s*(?:개최|안내|초청)|"
                                  r"(?:일\s*시|장\s*소)\s*[:：]", body))
    if (TOPICS["event"].search(head) and when and where and (invite or event_agenda) and not retrospective and not guide):
        evidence["event"] = ["named_event_in_first_lines", "date_or_time", "location",
                             "invitation" if invite else "event_agenda"]
    if (re.search(r"(?:사무국|선거관리위원회|동문회).{0,8}(?:공지|공고)|"
                  r"(?:회비\s*납부|선거|후보자\s*등록).{0,8}(?:공지|공고|안내)", first)
            and re.search(r"납부|기한|안내드립니다|제출|등록\s*기간|신청\s*방법|"
                          r"공고합니다|공지합니다|알려드립니다", body)):
        evidence["notice"] = ["administrative_notice_in_subject", "specific_action_or_notice"]
    if (TOPICS["news"].search(first)
            and re.search(r"수상|취임|선출|개최(?:했|하였|됐|되었)|출간|발간|기증|기부|발표", body)):
        evidence["news"] = ["news_section_in_subject", "reported_event"]
    return evidence, sorted(topics)


def visible_body(post):
    doc = post.get("content")
    if post["bodyStatus"] != "converted" or doc is None:
        return ""
    return "\n".join("".join(node["text"] for node in p.get("content", [])) for p in doc["content"])


def review(classification, posts, source_hashes):
    post_map = {post["sourceId"]: post for post in posts["posts"]}
    rows = classification["posts"]
    if len(post_map) != len(posts["posts"]) or len(rows) != len(post_map) or set(post_map) != {r["sourceId"] for r in rows}:
        raise ValueError("Body evidence source post IDs and classification differ")
    same_text = defaultdict(list)
    by_post = {}
    for key, post in post_map.items():
        text = visible_body(post)
        normalized = " ".join(unicodedata.normalize("NFC", text).split())
        if normalized:
            digest = hashlib.sha256(normalized.encode()).hexdigest()
            same_text[digest].append(key)
            by_post[key] = digest
    candidates = []
    statuses = Counter()
    options = Counter()
    for row in rows:
        if row["review"] != "unclassified":
            continue
        key = row["sourceId"]
        post = post_map[key]
        evidence, topics = assess(visible_body(post))
        # Multiple mentions can also reflect a year-end digest or a list of unrelated notices.
        duplicates = same_text[by_post[key]] if key in by_post else []
        if post["bodyStatus"] != "converted":
            state = "no_reviewable_text"
        elif len(duplicates) > 1:
            state = "duplicate_visible_body"
        elif len(evidence) > 1 or (evidence and len(set(topics) - evidence.keys()) > 0):
            state = "multiple_topics"
        elif len(evidence) == 1:
            state = "single_supported_candidate"
            options.update(evidence.keys())
        elif topics:
            state = "context_only"
        else:
            state = "no_explicit_topic"
        statuses[state] += 1
        candidate = {"sourceId": key, "sourceSha256": row["sha256"], "review": state,
                     "bodyStatus": post["bodyStatus"], "evidenceByCandidate": evidence, "mentionedTopics": topics}
        if len(duplicates) > 1:
            candidate["duplicateTextSha256"] = by_post[key]
        candidates.append(candidate)
    groups = {r["duplicateTextSha256"] for r in candidates if "duplicateTextSha256" in r}
    return {"source": classification["source"], "containerId": classification["containerId"],
            "throughKst": classification["throughDay"], "stage": "body-evidence-review-only",
            "inputSha256": source_hashes, "summary": {
                "scopeUnclassifiedPosts": len(candidates), "exclusiveReviewStates": dict(sorted(statuses.items())),
                "singleSupportedByDestination": dict(sorted(options.items())),
                "duplicateBodyGroups": len(groups)},
            "duplicateBodyGroups": {k: sorted(same_text[k]) for k in sorted(groups)}, "posts": candidates}


def destination_decisions(classification, posts, source_hashes, reviewed):
    """Apply the approved ordinary-feed policy; leave unresolved scope outside the action list."""
    post_map = {row["sourceId"]: row for row in posts["posts"]}
    decisions = []
    held = []
    counts = Counter()
    by_reason = Counter()
    for row in classification["posts"]:
        key = row["sourceId"]
        base = {"sourceId": key, "sha256": row["sha256"]}
        scope = row["automaticPostScope"]
        if scope:
            decisions.append({**base, "action": "exclude", "basis": scope})
            by_reason[scope] += 1
            continue
        entry = reviewed.get(key)
        if entry is not None:
            if entry["sha256"] != row["sha256"]:
                held.append({**base, "reason": "reviewed_source_changed"})
                continue
            if entry.get("exclusionReason"):
                reason = entry["exclusionReason"]
                decisions.append({**base, "action": "exclude", "basis": reason})
                by_reason[reason] += 1
                continue
            if entry["categoryName"] is None:
                held.append({**base, "reason": "destination_needs_review"})
                continue
            if entry.get("publicationHold"):
                base["publicationHold"] = entry["publicationHold"]
            if entry.get("confirmedAuthorName"):
                base["confirmedAuthorName"] = entry["confirmedAuthorName"]
        tags = set(row["hashtags"]["wrapped"]) | set(row["hashtags"]["literal"])
        tag_targets = {FOLDER_TAGS[tag] for tag in tags & FOLDER_TAGS.keys()}
        text = visible_body(post_map[key])
        evidence, topics = assess(text)
        explicit = {k.split("/")[0] for k in evidence}
        source_headings = {category for category, cues in row["categoryCandidates"].items()
                           if "subject_prefix" in cues or "source_notice_flag" in cues}
        # A post can open with a greeting and still carry a funeral or event notice.
        if entry is None and ("가입인사" in tags or JOIN_GREETING.search(text[:240])):
            held.append({**base, "reason": "join_greeting_needs_review"})
            continue
        if len(tag_targets) > 1:
            held.append({**base, "reason": "conflicting_destination_tags"})
            continue
        elif tag_targets:
            category, reason = next(iter(tag_targets)), "explicit_destination_hashtag"
        elif entry is not None:
            category, reason = entry["categoryName"], "reviewed_post_content"
        elif len(explicit) == 1 and not {k.split("/")[0] for k in topics} - explicit:
            category, reason = next(iter(explicit)), "clear_body_destination"
        elif len(source_headings) == 1 and not (explicit - source_headings):
            category, reason = next(iter(source_headings)), "source_heading_or_notice"
        else:
            category, reason = "free", "ordinary_feed_default"
        decisions.append({**base, "action": "publish", "categoryName": category, "basis": reason})
        counts[category] += 1
        by_reason[reason] += 1
    if len(decisions) + len(held) != len(post_map) or len(post_map) != len(classification["posts"]):
        raise ValueError("decision inventory differs from source")
    return {"source": classification["source"], "containerId": classification["containerId"],
            "throughKst": classification["throughDay"], "classificationSha256": source_hashes["classification"],
            "postsSha256": source_hashes["posts"], "stage": "development-destinations",
            "reviewedDestinationsSha256": source_hashes["reviewedDestinations"],
            "decisions": decisions, "unresolved": held, "summary": {"sourcePosts": len(post_map),
                "destinationSelected": sum(counts.values()), "excluded": len(decisions) - sum(counts.values()),
                "categories": dict(sorted(counts.items())),
                "basis": dict(sorted(by_reason.items())),
                "unresolved": dict(sorted(Counter(row["reason"] for row in held).items()))}}
