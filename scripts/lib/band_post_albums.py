"""Resolve post photos against the completed BAND photo index, including long galleries."""
from collections import defaultdict
from datetime import date, datetime
from hashlib import file_digest, sha256
import json
import os
import re
from tempfile import NamedTemporaryFile
from zoneinfo import ZoneInfo


class PostAlbums:
    def __init__(self, archive, band, through, candidates, decision_path):
        self.archive, self.band = archive, band
        self.converted_jpegs = archive / 'migration' / f'band-{through}' / 'converted/jpeg'
        self.decisions, self.decision_sha = {}, None
        if decision_path.exists():
            data = decision_path.read_bytes()
            decisions = json.loads(data)
            if (decisions["containerId"], decisions["throughKst"], decisions["format"]) != (
                    band, through, "band-post-photo-destinations-v1"):
                raise ValueError("Photo decisions belong to another backup")
            self.decisions, self.decision_sha = decisions["posts"], sha256(data).hexdigest()
        # Keep the reviewed photo list bound to this import, even as the live backup advances.
        frozen = decision_path.parent / "source-photo-index.json"
        if frozen.exists():
            index = json.loads(frozen.read_bytes())
        else:
            index = json.loads((archive / f"band-{band}/photo-list-index.json").read_bytes())
        if not index["complete"] or index["daily"]["coveredThrough"] != through:
            raise ValueError("Incomplete photo index for selected backup day")
        if not frozen.exists():
            with NamedTemporaryFile(dir=frozen.parent, delete=False) as tmp:
                try:
                    tmp.write(json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode())
                    tmp.flush()
                    try:
                        os.link(tmp.name, frozen)
                    except FileExistsError:
                        if json.loads(frozen.read_bytes()) != index:
                            raise ValueError("Concurrent photo inventory differs for selected backup day")
                finally:
                    os.unlink(tmp.name)
        self.index_sha = sha256(frozen.read_bytes()).hexdigest()
        self.through = through
        self.photos = defaultdict(dict)
        self.by_album = defaultdict(dict)
        for key, photo in index["photos"].items():
            if str(photo["photo_no"]) != key or not key.isdecimal():
                raise ValueError("Photo index key disagrees with original")
            self.photos[str(photo.get("post_no"))][key] = photo
            if photo.get("album_no"):
                self.by_album[str(photo["album_no"])][key] = photo
        self.files = defaultdict(dict)
        for row in [*candidates["candidates"], *candidates["held"]]:
            if (row["kind"] != "photo" or row.get("reason") not in (None, "post-has-over-40-images")
                    or row.get("destination") != "image" or row.get("parent", {}).get("type") != "post"):
                continue
            owner = self.files[row["parent"]["id"]]
            if row["sourceId"] in owner:
                raise ValueError("Duplicate source photo")
            owner[row["sourceId"]] = row
        self.albums, self.entries, self.blobs = [], {}, {}
        self.reused = []

    def native_photos(self, sid, card, review, feed, media, schedules):
        group = str(card["no"])
        indexed = self.by_album.get(group, {})
        if (group != review["albumId"] or card["is_deleted"] is not False or card["video_count"] != 0
                or not indexed or card["photo_count"] != len(indexed) or not card["name"].strip()):
            raise ValueError(f"Native album does not match the completed photo index: {sid}")
        ids = list(dict.fromkeys([*feed, *indexed]))
        if review["photoIds"] != ids:
            raise ValueError(f"Native album membership differs: {sid}")
        day = date.fromisoformat(review["eventDay"])
        if not any(s["period"].split(" ", 3)[:3] == [f"{day.year}년", f"{day.month}월", f"{day.day}일"]
                   for s in schedules):
            raise ValueError(f"Original schedule differs from selected event date: {sid}")
        for key in ids:
            source = indexed.get(key) or self.photos[sid].get(key)
            row = media.get(key)
            self.files[sid][key] = self.saved_photo(source, row, f"{sid}/{key}")
        return ids

    def saved_photo(self, index_row, media_row, key):
        if (not index_row or index_row.get("is_restricted") is not False
                or index_row.get("savable_state") not in ("enabled", "unassigned")
                or not media_row or media_row["status"] != "saved" or not media_row["verified"]
                or not 0 < media_row["bytes"] <= 5 * 1024 * 1024):
            raise ValueError(f"Source album photo is unavailable: {key}")
        return {**media_row, "file": f"band-{self.band}/" + media_row["file"]}

    def resolve(self, sid, order, covers):
        feed = [key for kind, key in order if kind == "photo"]
        indexed = self.photos[sid].keys() - covers
        if indexed == set(feed) and sid not in self.decisions:
            return None, None
        ids = [*feed, *sorted(indexed.difference(feed), key=int)]
        for key in ids:
            evidence = self.photos[sid].get(key)
            if key not in self.files[sid] or not evidence:
                return ids, "media:album_photo_missing"
            if evidence.get("is_restricted") is not False or evidence.get("savable_state") not in ("enabled", "unassigned"):
                return ids, "media:album_photo_restricted"
        return ids, None

    def decision(self, sid, source_sha, ids):
        row = self.decisions.get(sid)
        if not row:
            return None
        if (row["sourceSha256"] != source_sha or row["photoIds"] != ids
                or row["destination"] not in ("post", "heritage") or not row["basis"].strip()):
            raise ValueError(f"Photo decision differs from source post {sid}")
        return row

    def link(self, sid, content):
        album_id = f"band-{self.band}-post-{sid}"
        link = {"type": "link", "attrs": {"href": f"/about/heritage/albums?album={album_id}",
                                         "target": "_blank", "rel": "noopener noreferrer", "class": None}}
        content["content"].append({"type": "paragraph", "content": [
            {"type": "text", "text": "사진첩 보기", "marks": [link]}]})

    def add(self, sid, title, timestamp, ids, content, day=None):
        album_id = f"band-{self.band}-post-{sid}"
        ordered = self.add_photos(ids, self.files[sid])
        day = day or datetime.fromisoformat(timestamp).astimezone(ZoneInfo("Asia/Seoul")).date().isoformat()
        album = {"id": album_id, "date": day, "title": title, "coverPhotoId": ordered[0],
                 "photoIds": ordered}
        self.albums.append(album)
        self.link(sid, content)
        return self.proof(album)

    def add_photos(self, ids, files, start=1, details=None):
        ordered = []
        details = details or {}
        for position, key in enumerate(ids, start):
            row = files[key]
            photo_id = f"band-{self.band}-photo-{key}"
            ext = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}[row["contentType"]]
            filename = f"{row['sha256']}.{ext}"
            photo = {"id": photo_id, "caption": f"사진 {position}", "file": filename, **details.get(key, {})}
            if photo_id in self.entries:
                raise ValueError("Same indexed photo has more than one owning post")
            self.entries[photo_id] = photo
            ordered.append(photo_id)
            self.blobs.setdefault(filename, row)
        return ordered

    def proof(self, album):
        photos = [self.entries[key] for key in album["photoIds"]]
        proof = [album["id"], album["date"], album["title"], album["coverPhotoId"],
                 [[p["id"], p["caption"], p["file"]] for p in photos]]
        return sha256(json.dumps(proof, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

    def catalog(self):
        owners = {a["id"]: a for a in self.albums}
        for owner, ids, expected in self.reused:
            album = owners[f"band-{self.band}-post-{owner}"]
            if set(album["photoIds"]) != {f"band-{self.band}-photo-{i}" for i in ids}:
                raise ValueError("Existing album contains a different photograph set")
            if self.proof(album) != expected:
                raise ValueError("Existing album proof differs")
        return {"schemaVersion": 1, "albums": self.albums, "photos": list(self.entries.values())}

    def approved_standalone(self, path, media, proofs):
        if not path.exists():
            return None
        raw = path.read_bytes()
        review = json.loads(raw)
        if (review["format"], review["containerId"], review["throughKst"], review["photoIndexSha256"]) != (
                "band-standalone-album-review-v1", self.band, self.through, self.index_sha):
            raise ValueError("Standalone album review does not match the frozen photo index")
        # Verify linked albums before appending independently approved source photos.
        self.catalog()
        albums = {a["id"]: a for a in self.albums}
        known_hashes = {p["file"].split(".", 1)[0] for p in self.entries.values()}
        for row in review["albums"]:
            source_id = row["sourceAlbumId"]
            source = self.by_album.get(source_id)
            ids = row["photoIds"]
            if not source_id.isdecimal() or not ids or not source or not set(ids) <= source.keys():
                raise ValueError(f"Standalone album photo inventory differs: {source_id}")
            details = row.get("photoDetails", {})
            if not isinstance(details, dict) or not details.keys() <= set(ids) or any(
                    not isinstance(values, dict) or not values.keys() <= {"caption", "credit"}
                    or any(not isinstance(text, str) or not text.strip() or text != text.strip()
                           for text in values.values())
                    for values in details.values()):
                raise ValueError(f"Invalid standalone photo descriptions: {source_id}")
            owner = row.get("existingPostId")
            reference = row.get("referencePhotoId")
            if reference is not None and (owner or reference not in ids):
                raise ValueError(f"Standalone album reference photo differs: {source_id}")
            files = {}
            for key in ids:
                if source[key].get("post_no"):
                    raise ValueError(f"Standalone album photo already has a source post: {key}")
                photo = self.saved_photo(source[key], media.get(key), f"{source_id}/{key}")
                if photo["sha256"] in known_hashes:
                    raise ValueError(f"Standalone album photo duplicates a stored file: {key}")
                known_hashes.add(photo["sha256"])
                files[key] = photo
            if owner:
                album = albums[f"band-{self.band}-post-{owner}"]
                if proofs[owner] != row["priorAlbumSha256"] or any(key == owner for key, _, _ in self.reused):
                    raise ValueError(f"Standalone photo additions do not match the existing album: {source_id}")
                album["photoIds"].extend(self.add_photos(ids, files, len(album["photoIds"]) + 1, details))
                proofs[owner] = self.proof(album)
            else:
                album_id = f"band-{self.band}-album-{source_id}"
                if reference is not None:
                    album_id += f"-photo-{reference}"
                if album_id in albums:
                    raise ValueError(f"Standalone album is already defined: {album_id}")
                if not row["title"].strip() or not re.fullmatch(r"\d{4}(?:-\d{2}){0,2}", row["date"]):
                    raise ValueError(f"Invalid standalone album title or date: {source_id}")
                added = self.add_photos(ids, files, details=details)
                album = {"id": album_id, "date": row["date"], "title": row["title"],
                         "photoIds": added, "coverPhotoId": added[0]}
                if "description" in row:
                    album["description"] = row["description"]
                albums[album_id] = album
                self.albums.append(album)
        return sha256(raw).hexdigest()

    def stage(self, destination):
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        for filename, row in self.blobs.items():
            source = (self.archive / row["file"]).resolve(strict=True)
            original = source.is_relative_to(self.archive / f"band-{self.band}/assets")
            converted = (row.get("decodedPixelSha256") and row.get("inputSha256")
                         and source == self.converted_jpegs / (row["sha256"] + ".jpg"))
            if not (original or converted):
                raise ValueError("Photo bytes outside source archive")
            with source.open("rb") as stream:
                if file_digest(stream, "sha256").hexdigest() != row["sha256"] or source.stat().st_size != row["bytes"]:
                    raise ValueError("Source photo bytes changed")
            target = destination / filename
            if not target.exists():
                os.link(source, target)
            elif not target.samefile(source):
                raise ValueError("Conflicting staged photo")
