"""Resolve BAND authors by unique roster name, using cohort for homonyms."""

import argparse
import base64
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from tempfile import NamedTemporaryFile
import unicodedata


ROOT = Path(__file__).resolve().parents[1] / "local-backups/community"
BAND = "11089836"
NAME = r"[가-힣]{2,5}"
SCHOOL = r"(?:동국(?:대학교|대)?\s*(?:한의과대학|한의학과|한의대|한의)?\s*)?"
COHORT = r"(?:졸업\s*)?(?:제\s*)?(?P<number>[1-9][0-9]?)\s*기"
SEP = r"[\s()\[\],:;/·._-]*"
COHORT_PREFIX = re.compile(rf"^{SEP}{SCHOOL}{COHORT}(?=$|[\s()\[\],:;/·._-])")
ANY_COHORT = re.compile(r"(?<!\d)([1-9][0-9]?)\s*기(?=$|[\s()\[\],:;/·._-])")
LABEL_AFTER = re.compile(rf"^(?P<name>{NAME}){SEP}{SCHOOL}{COHORT}(?=$|[\s()\[\],:;/·._-])")
LABEL_BEFORE = re.compile(rf"^{SCHOOL}{COHORT}{SEP}(?P<name>{NAME})(?=$|[\s()\[\],:;/·._-])")
# A class recorded for a child, a different school, or a training course cannot identify this alumnus.
AMBIGUOUS = re.compile(r"아버지|어머니|아들|아드님|딸|자녀|배우자|남편|부인|학부모|아빠|엄마|대학원|고등학교|수료|연수|수련|아카데미")
REGION_LABEL = re.compile(
    rf"(?P<name>{NAME})\s+(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
)


def normalized(value):
    return unicodedata.normalize("NFC", (value or "").strip())


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def profile_evidence(label, description):
    direct = LABEL_AFTER.match(label) or LABEL_BEFORE.match(label)
    plain_name = re.fullmatch(NAME, label)
    name = direct["name"] if direct else label if plain_name else None
    numbers = {direct["number"]} if direct else set()
    prefix = COHORT_PREFIX.match(description)
    if prefix and not AMBIGUOUS.search(description):
        numbers.add(prefix["number"])
    explicit = set(ANY_COHORT.findall(label)) | set(ANY_COHORT.findall(description))
    if AMBIGUOUS.search(label) or len(numbers | explicit) > 1:
        return None, None, True
    return name, next(iter(numbers), None), False


def source_authors(through):
    profiles = defaultdict(set)
    occurrences = defaultdict(Counter)
    missing = Counter()
    unknown_without_key = set()
    path = (ROOT / "archive.sqlite3").as_uri()
    with sqlite3.connect(f"{path}?mode=ro", uri=True) as db:
        args = ("band", BAND)
        checkpoint, = db.execute(
            "SELECT checkpoint_json FROM sources WHERE source=? AND container_id=?", args
        ).fetchone()
        actual = json.loads(checkpoint)["daily"]["coveredThrough"]
        if actual != through:
            raise ValueError(f"Requested cutoff {through}, backup cutoff {actual}")
        for kind, raw in db.execute(
            "SELECT kind,raw_json FROM source_items WHERE source=? AND container_id=? "
            "AND kind IN ('post','comments')", args
        ):
            data = json.loads(raw)
            if kind == "post":
                records = [("posts", data["sourceData"])]
            else:
                records = []
                for page in data["pages"]:
                    for top in page["items"]:
                        records.append(("comments", top))
                        records.extend(("replies", reply) for reply in top.get("latest_comment", []))
            for record_type, item in records:
                author = item.get("author") or {}
                uid = author.get("user_no")
                if type(uid) is not int or uid < 1:
                    missing[record_type] += 1
                    if unknown_display(author.get("name")):
                        sid = str(item["post_no"])
                        if record_type == "posts":
                            unknown_without_key.add(sid)
                        elif record_type == "comments":
                            unknown_without_key.add(f"post:{sid}/comment:{item['comment_id']}")
                        else:
                            unknown_without_key.add(f"post:{sid}/comment:{item['origin_comment_id']}/reply:{item['comment_id']}")
                    continue
                key = digest(f"band:{BAND}:user:{uid}")
                occurrences[key][record_type] += 1
                profiles[key].add((
                    normalized(author.get("name")), normalized(author.get("description")),
                    bool(author.get("is_deleted")),
                ))
    return profiles, occurrences, missing, unknown_without_key


def unknown_display(label):
    return "".join(normalized(label).split()) == "(알수없음)"


def standing_rules(folder, profiles):
    path = folder.parent / f"band-{BAND}-author-rules.json"
    if not path.exists():
        return set(), {}
    rules = json.loads(path.read_bytes())
    if rules["containerId"] != BAND:
        raise ValueError("Author rules belong to another BAND")
    spam = set()
    with sqlite3.connect((ROOT / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        for row in rules["spamAccounts"]:
            proof = row["evidence"]
            author = confirmed_source_author(db, proof)
            key = digest(f"band:{BAND}:user:{author['user_no']}")
            if key != row["sourceAuthorKey"] or normalized(author["name"]) != normalized(proof["sourceName"]):
                raise ValueError("Spam confirmation does not match the source account")
            spam.add(key)
    matches = {}
    for rule in rules["profileCohorts"]:
        name, marker, cohort = (rule[k] for k in ("name", "marker", "graduationCohort"))
        if not re.fullmatch(NAME, name) or not marker.strip() or not re.fullmatch(r"[1-9][0-9]?", str(cohort)):
            raise ValueError("Invalid confirmed name and cohort notation")
        marker_pattern = re.escape(marker).replace(r"\(", r"\s*\(\s*").replace(r"\)", r"\s*\)")
        notation = re.compile(rf"(?<!\d){marker_pattern}(?!\d)")
        person = re.compile(rf"(?<![가-힣]){re.escape(name)}(?![가-힣])")
        for key, versions in profiles.items():
            if any(person.search(label) and notation.search(f"{label} {bio}") for label, bio, _ in versions):
                pair = name, str(cohort)
                if key in matches and matches[key] != pair:
                    raise ValueError("Conflicting confirmed cohort notations")
                matches[key] = pair
    return spam, matches


def identify(snapshots):
    names, cohorts, pairs = set(), set(), set()
    for label, description, _ in snapshots:
        name, cohort, conflict = profile_evidence(label, description)
        if conflict:
            return None, "ambiguous_profile"
        if name:
            names.add(name)
        if cohort:
            cohorts.add(cohort)
        if name and cohort:
            pairs.add((name, cohort))
    if len(names) > 1 or len(cohorts) > 1:
        return None, "conflicting_profiles"
    if len(pairs) != 1:
        if all(deleted for _, _, deleted in snapshots):
            return None, "deleted_profile_without_name_and_cohort"
        return None, "name_or_explicit_cohort_missing"
    return next(iter(pairs)), None


def pair_id(name, number):
    return digest(f"{name}|{number}")


def pair_tokens(name, cohort):
    return {pair_id(unicodedata.normalize(form, name), cohort) for form in ("NFC", "NFD")}


def lookup_sql(pairs, names=()):
    # Only digests go to the development host. It returns matching names and counts
    # only, never user IDs, contacts, or a copy of the roster. No temp table is needed.
    tokens = {token for name, number in pairs for token in pair_tokens(name, number)}
    tokens.update(token for name in names for token in pair_tokens(name, ""))
    wanted = ",".join(f"'{token}'" for token in sorted(tokens))
    return f"""BEGIN READ ONLY;
DO $$ BEGIN IF current_database() <> 'heliumdb' THEN RAISE EXCEPTION 'Expected heliumdb'; END IF; END $$;
WITH roster AS (
  SELECT btrim(alumni_name) AS name, btrim(generation) AS cohort
  FROM public.users WHERE NULLIF(btrim(alumni_name), '') IS NOT NULL
), paired AS (
  SELECT encode(sha256(convert_to(name || '|' || suffix, 'UTF8')), 'hex') AS token, name
  FROM roster CROSS JOIN LATERAL (VALUES (''), (NULLIF(cohort, ''))) AS variants(suffix)
  WHERE suffix IS NOT NULL
)
SELECT json_build_object('database', current_database(),
  'rosterFingerprint', (SELECT encode(sha256(convert_to(string_agg(token, ',' ORDER BY token), 'UTF8')), 'hex') FROM paired),
  'pairs', COALESCE(json_agg(x),'[]'::json))
FROM (SELECT token, min(name) AS name, count(*) AS n FROM paired
      WHERE token = ANY(ARRAY[{wanted}]::text[]) GROUP BY token) x;
COMMIT;
"""


def name_from_profiles(versions):
    names = set()
    for label, _, _ in versions:
        direct = LABEL_AFTER.match(label) or LABEL_BEFORE.match(label) or REGION_LABEL.fullmatch(label)
        if AMBIGUOUS.search(label):
            continue
        if direct:
            names.add(direct["name"])
        elif re.fullmatch(NAME, label):
            names.add(label)
    return next(iter(names)) if len(names) == 1 else None


def reviewed_candidates(folder, through):
    preview_bytes = (folder / "원작성자-실명-사전매칭.json").read_bytes()
    preview = json.loads(preview_bytes)
    welcome = json.loads((folder / ".join-review/matched.json").read_bytes())
    if (preview["through"], welcome["through"], welcome["containerId"], welcome["priorMatchingSha256"]) != (
        through, through, BAND, hashlib.sha256(preview_bytes).hexdigest()
    ):
        raise ValueError("Reviewed author evidence belongs to another snapshot")
    overrides = {key: (v["displayName"], v["cohort"]) for key, v in preview["authors"].items()}
    blocked = set()
    for v in welcome["evidence"]:
        key, name, cohort = v["key"], v["displayName"], v["cohort"]
        if v["outcome"] == "conflict":
            prior_name, _ = overrides.get(key, (None, None))
            if prior_name != name:
                blocked.add(key)
            else:
                # The name is consistent, but neither cohort can break a tie.
                overrides[key] = (name, None)
        else:
            overrides[key] = (name, cohort)
    return overrides, blocked


def confirmed_source_author(db, proof):
    sid = proof["sourceId"]
    kind = "comments" if "sourceCommentId" in proof else "post"
    src = db.execute("SELECT raw_json, raw_sha256 FROM source_items WHERE source='band' "
                     "AND kind=? AND container_id=? AND source_id=?", (kind, BAND, sid)).fetchone()
    if not src or digest(src[0]) != src[1] or src[1] != proof["sha256"]:
        raise ValueError(f"Account confirmation source changed: {sid}")
    doc = json.loads(src[0])
    if kind == "post":
        return doc["sourceData"]["author"]

    comments = [item for page in doc["pages"] for item in page["items"]]
    parent_id = proof.get("sourceParentCommentId")
    if parent_id is not None:
        comments = [reply for root in comments if str(root["comment_id"]) == parent_id
                    for reply in root.get("latest_comment", [])]
    matches = [item for item in comments if str(item["post_no"]) == sid
               and str(item["comment_id"]) == proof["sourceCommentId"]]
    if str(doc["postNo"]) != sid or len(matches) != 1:
        raise ValueError(f"Account confirmation comment missing or ambiguous: {sid}/{proof['sourceCommentId']}")
    return matches[0]["author"]


def confirmed_accounts(folder, through):
    path = folder / "confirmed-author-accounts.json"
    if not path.exists():
        return {}
    review = json.loads(path.read_bytes())
    if (review["containerId"], review["throughKst"]) != (BAND, through):
        raise ValueError("Account confirmations belong to a different snapshot")
    result = {}
    with sqlite3.connect((ROOT / "archive.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        for row in review["accounts"]:
            key, name = row["sourceAuthorKey"], row["realName"]
            if key in result or not name.strip() or name != normalized(name) or not row["evidence"]:
                raise ValueError("Duplicate or incomplete confirmed account")
            for proof in row["evidence"]:
                author = confirmed_source_author(db, proof)
                if (digest(f"band:{BAND}:user:{author['user_no']}") != key or
                        normalized(author["name"]) != normalized(proof["sourceName"])):
                    raise ValueError(f"Account confirmation identity changed: {proof['sourceId']}")
            basis = row.get("basis", "confirmed_account")
            if basis not in {"confirmed_account", "reviewed_profile", "reviewed_office_record"}:
                raise ValueError("Unknown account evidence basis")
            identity = {"realName": name, "basis": basis}
            role = row.get("historicalRole")
            if role is not None:
                if (not isinstance(role, str) or not role or role != normalized(role)
                        or not role.isprintable() or len(f"당시 {role} {name}") > 500):
                    raise ValueError("Invalid confirmed historical role")
                identity["historicalRole"] = role
            result[key] = identity
    return result


def query_development(sql):
    # Replit SSH runs a command in the workspace without forwarding psql stdin.
    encoded = base64.b64encode(sql.encode()).decode("ascii")
    remote = f"printf %s {encoded} | base64 -d | psql -XAtq -v ON_ERROR_STOP=1"
    read = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=12", "-i",
         str(Path.home() / ".ssh/replit"), "-p", "22",
         "dc5e5541-525b-4ad6-b914-2d2db70cb4a9@ssh.sisko.replit.dev", remote],
        capture_output=True, text=True, timeout=90,
    )
    if read.returncode:
        error = next((line for line in (read.stderr + read.stdout).splitlines() if any(x in line.lower() for x in ('error', 'long', 'invalid', 'failed', 'psql:', 'cannot', 'not found'))), 'no diagnostic line')
        safe = re.sub(r"[0-9a-f]{16,}", "[digest]", error)
        raise RuntimeError(f"Read-only development query failed (SSH/psql exit {read.returncode}); {safe}")
    response = json.loads(read.stdout.strip())
    if response.get("database") != "heliumdb":
        raise ValueError("Read-only development roster result missing")
    return response


def roster_match(source, name, cohort):
    records = [source[token] for token in pair_tokens(name, cohort) if token in source]
    if records:
        return {"name": records[0]["name"], "n": sum(record["n"] for record in records)}
    return None


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("cutoff", type=date.fromisoformat)
    parser.add_argument("--query", action="store_true", help="Write read-only development SQL to stdout.")
    parser.add_argument("--reviewed-preview", action="store_true", help="Include reviewed profile and welcome-comment evidence.")
    opt = parser.parse_args()
    through = opt.cutoff.isoformat()
    profiles, counts, missing, unknown_without_key = source_authors(through)
    candidates = {key: identify(versions) for key, versions in profiles.items()}
    folder = ROOT / "migration" / f"band-{through}"
    confirmed = confirmed_accounts(folder, through)
    overrides, blocked = reviewed_candidates(folder, through) if opt.reviewed_preview else ({}, set())
    spam, notation = standing_rules(folder, profiles)
    overrides.update(notation)
    blocked.difference_update(notation)
    if not (overrides.keys() | blocked | confirmed.keys()) <= profiles.keys():
        raise ValueError("Reviewed author key missing from the snapshot")
    names = {key: name_from_profiles(versions) for key, versions in profiles.items()}
    for key, (name, cohort) in overrides.items():
        candidates[key] = ((name, cohort) if cohort else None, None)
        names[key] = name
    pairs = {pair for pair, _ in candidates.values() if pair}
    sql = lookup_sql(pairs, {name for name in names.values() if name} | {name for name, _ in pairs})
    if opt.query:
        sys.stdout.write(sql)
        return
    inputs = sorted(pairs | {(name, "") for name in names.values() if name} | {(name, "") for name, _ in pairs})
    source = {}
    roster_fingerprints = set()
    for offset in range(0, len(inputs), 80):
        response = query_development(lookup_sql(inputs[offset:offset + 80]))
        roster_fingerprints.add(response["rosterFingerprint"])
        source.update({row["token"]: row for row in response["pairs"]})
    if len(roster_fingerprints) != 1:
        raise ValueError("The development roster changed between lookups")
    owners = Counter(pair for pair, _ in candidates.values() if pair)
    authors = {}
    status = Counter()
    scope = defaultdict(Counter)
    scope["unresolved"].update(missing)
    for key, (pair, reason) in sorted(candidates.items()):
        if key in spam or any(unknown_display(label) for label, _, _ in profiles[key]):
            reason = "spam_account" if key in spam else "withdrawn_account"
            authors[key] = {"status": reason}
            status[reason] += 1
            scope["unresolved"].update(counts[key])
            continue
        name = None
        expected = pair[0] if pair else names[key]
        name_match = roster_match(source, expected, "") if expected else None
        if key in blocked:
            reason = "welcome_comment_conflict"
        elif name_match and name_match["n"] == 1:
            name, reason = name_match["name"], "verified"
        elif pair:
            match = roster_match(source, *pair)
            if not match:
                reason = "roster_pair_missing"
            elif match["n"] != 1:
                reason = "roster_pair_ambiguous"
            elif normalized(match["name"]) != pair[0]:
                raise ValueError("Roster pair/name response mismatch")
            else:
                name, reason = match["name"], "verified"
        elif expected:
            reason = "roster_name_ambiguous" if name_match else "roster_name_missing"
        if name and normalized(name) != expected:
            raise ValueError("Roster/name response mismatch")
        if key in confirmed:
            confirmed_name = confirmed[key]["realName"]
            if name and normalized(name) != confirmed_name:
                raise ValueError("Confirmed account conflicts with the matched roster name")
            name, reason = confirmed_name, "verified"
        status[reason] += 1
        scope["verified" if name else "unresolved"].update(counts[key])
        authors[key] = {"status": reason}
        if key in confirmed:
            authors[key].update(confirmed[key])
        elif name:
            authors[key]["realName"] = name
            authors[key]["basis"] = "unique_name" if name_match and name_match["n"] == 1 else "unique_name_and_cohort"
    summary = {"sourceAuthorKeys": len(authors), "candidateKeys": sum(owners.values()),
               "candidatePairs": len(pairs), "authorStatus": dict(status),
               "missingSourceAuthor": dict(missing), "records": {k: dict(v) for k, v in scope.items()}}
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    payload = {"source": "band", "containerId": BAND, "cutoff": through,
               "rosterSource": "heliumdb:users.alumni_name+generation",
               "summary": summary, "authors": authors,
               "unknownWithoutKey": sorted(unknown_without_key)}
    with NamedTemporaryFile(mode="w", dir=folder, delete=False, encoding="utf-8") as tmp:
        json.dump(payload, tmp, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        tmp.write("\n")
    os.replace(tmp.name, folder / "authors.json")
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
