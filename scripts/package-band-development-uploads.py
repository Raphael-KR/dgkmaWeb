"""Copy only files in a reviewed, local BAND upload queue into a private transfer directory."""
import argparse
from datetime import date
from hashlib import file_digest, sha256
from itertools import groupby
import json
import os
from pathlib import Path
import re
import tempfile
from uuid import NAMESPACE_URL, uuid5
from lib.band_content_review import reviewed_jpegs

COMMUNITY = Path(__file__).resolve().parents[1] / 'local-backups/community'
UPLOAD_NAMESPACE = uuid5(NAMESPACE_URL, 'https://dgkma.org/development/imports/band/11089836/uploads')
FIELDS = ('name', 'contentType', 'size', 'sha256')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def key(row):
    return tuple(row[k] for k in FIELDS)


def check_existing(directory, metadata, hashes):
    require(directory.is_dir() and not directory.is_symlink(), 'unsafe existing package directory')
    require({p.name for p in directory.iterdir()} == {'upload-manifest.json', 'files'},
            'unexpected existing package entries')
    manifest = directory / 'upload-manifest.json'
    files = directory / 'files'
    require(manifest.is_file() and not manifest.is_symlink() and manifest.read_bytes() == metadata,
            'existing package manifest differs')
    require(files.is_dir() and not files.is_symlink() and {p.name for p in files.iterdir()} == hashes,
            'existing package file set differs')
    for path in files.iterdir():
        require(path.is_file() and not path.is_symlink(), 'unexpected file in existing package')
        with path.open('rb') as inp:
            require(file_digest(inp, 'sha256').hexdigest() == path.name, 'existing file digest differs')


def regular_files(folder, queue, candidates):
    eligible = list(candidates['candidates'])
    review_file = folder / 'reviewed-post-content.json'
    if review_file.exists():
        raw = review_file.read_bytes()
        state = json.loads((folder / 'manifest-status.json').read_bytes())
        require(sha256(raw).hexdigest() == state['postContentDecisionSha256'],
                'content review differs from selected posts')
        reviews = {row['sourceId']: row for row in json.loads(raw)['posts']}
        media = (folder / 'media.json').read_bytes()
        require(sha256(media).hexdigest() == state['inputSha256']['media'],
                'reviewed JPEG source inventory differs')
        eligible.extend(reviewed_jpegs(folder.resolve(), reviews, candidates, json.loads(media)).values())
    decisions = folder / 'photo-destinations.json'
    if decisions.exists():
        raw = decisions.read_bytes()
        status = json.loads((folder / 'manifest-status.json').read_bytes())
        require(sha256(raw).hexdigest() == status['photoDecisionSha256'], 'photo decision differs from selected posts')
        direct = {r['sourceId'] for r in status['posts']
                  if r['state'] in ('selected', 'ready') and r.get('photoDestination') == 'post'}
        approved = {(sid, key) for sid, record in json.loads(raw)['posts'].items()
                    if sid in direct and record['destination'] == 'post' for key in record['photoIds']}
        eligible.extend(r for r in candidates['held'] if r['reason'] == 'post-has-over-40-images'
                        and r['kind'] == 'photo' and r['parent']['type'] == 'post'
                        and (r['parent']['id'], r['sourceId']) in approved)
    allowed = {(r['file'], r['name'], r['contentType'], r['bytes'], r['sha256']) for r in eligible}
    selected = {}
    sources = {}
    for row in queue['assets']:
        identity = key(row)
        require((row['file'], *identity) in allowed, 'queue item not found in locally validated candidates')
        require(identity not in selected, 'duplicate upload identity')
        require(re.fullmatch(r'[0-9a-f]{64}', row['sha256']), 'invalid source digest')
        path = (COMMUNITY / row['file']).resolve(strict=True)
        require(path.is_file() and (path.is_relative_to(COMMUNITY / 'band-11089836/assets')
                                    or path.is_relative_to(folder / 'converted')),
                'source is outside validated attachment directories')
        canonical = json.dumps(identity, ensure_ascii=True, separators=(',', ':'))
        selected[identity] = {'objectPath': f'/objects/band-imports/{uuid5(UPLOAD_NAMESPACE, canonical)}',
                              **{k: row[k] for k in FIELDS}}
        sources.setdefault(row['sha256'], (path, row['size']))

    assets = sorted(selected.values(), key=lambda a: a['objectPath'])
    return 'assets', assets, sources


def video_files(folder, queue, candidates):
    approved = set(queue['postIds'])
    require(len(approved) == len(queue['postIds']) and
            all(isinstance(pid, str) and re.fullmatch(r'[1-9][0-9]*', pid) for pid in approved),
            'invalid or duplicate video source post')
    found, seen_ids, sources, videos = set(), set(), {}, []
    for row in candidates['videoCandidates']:
        pid = row['parent']['id']
        if row['parent']['type'] != 'post' or pid not in approved:
            continue
        require(row['kind'] == 'video' and row['contentType'] == 'video/mp4' and
                re.fullmatch(r'[0-9a-f]{64}', row['sha256']) and row['sourceId'] not in seen_ids,
                'invalid video inventory entry')
        path = (COMMUNITY / row['file']).resolve(strict=True)
        require(path.is_file() and path.is_relative_to(COMMUNITY / 'band-11089836/assets'),
                'video source outside actual backup')
        found.add(pid)
        seen_ids.add(row['sourceId'])
        sources.setdefault(row['sha256'], (path, row['bytes']))
        videos.append(dict(sourcePostId=pid, sourceVideoId=row['sourceId'], sha256=row['sha256'],
                           size=row['bytes'], position=row['position'], contentType='video/mp4'))
    require(found == approved, 'selected video post missing from candidates')
    videos.sort(key=lambda row: (int(row['sourcePostId']), row['position']))
    for pid, group in groupby(videos, key=lambda row: row['sourcePostId']):
        positions = [r['position'] for r in group]
        require(positions == list(range(len(positions))), f'incomplete or duplicated video order: {pid}')
    return 'videos', videos, sources


def package(day, approved, videos):
    folder = COMMUNITY / 'migration' / f'band-{day}'
    kind = 'video' if videos else 'upload'
    raw = (folder / f'{kind}-queue.json').read_bytes()
    actual = sha256(raw).hexdigest()
    require(approved == actual, f'queue SHA-256 mismatch, expected {approved}, actual {actual}')
    queue = json.loads(raw)
    require((queue['format'], queue['environment'], queue['containerId'], queue['throughKst']) ==
            (f'band-development-{kind}-queue-v1', 'development', '11089836', day),
            'queue target or source cutoff mismatch')
    candidate_bytes = (folder / 'attachment-candidates.json').read_bytes()
    candidates = json.loads(candidate_bytes)
    require(candidates['throughDay'] == day and candidates['containerId'] == '11089836',
            'attachment inventory source mismatch')
    if videos:
        require(sha256(candidate_bytes).hexdigest() == queue['sourceCandidatesSha256'],
                'video selection belongs to a different attachment inventory')
    select = video_files if videos else regular_files
    field, selected, sources = select(folder, queue, candidates)
    manifest = dict(format=f'band-development-{kind}-package-v2', environment='development',
                    containerId='11089836', throughKst=day, sourceQueueSha256=actual)
    manifest[field] = selected
    save_package(folder / f'{kind}-packages' / 'v2', manifest, sources)


def save_package(parent, manifest, sources):
    data = (json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    actual = manifest['sourceQueueSha256']
    target = parent / actual
    if target.exists():
        check_existing(target, data, set(sources))
    else:
        with tempfile.TemporaryDirectory(dir=parent) as tmp:
            candidate = Path(tmp) / 'package'
            files = candidate / 'files'
            files.mkdir(mode=0o700, parents=True)
            for digest, (source, size) in sources.items():
                with source.open('rb') as inp, (files / digest).open('xb') as out:
                    copy = sha256()
                    while data_block := inp.read(1024 * 1024):
                        copy.update(data_block)
                        out.write(data_block)
                    require(out.tell() == size and copy.hexdigest() == digest,
                            f'changed local asset; expected {digest}, {size} bytes')
            (candidate / 'upload-manifest.json').write_bytes(data)
            candidate.rename(target)
    print(json.dumps(dict(queueSha256=actual, manifestSha256=sha256(data).hexdigest(),
                          items=sum(len(manifest.get(key, [])) for key in ('assets', 'videos')), uniqueFiles=len(sources))))


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('through_day', type=date.fromisoformat)
    parser.add_argument('reviewed_queue_sha256')
    parser.add_argument('--videos', action='store_true', help='package the approved private video queue')
    args = parser.parse_args()
    package(str(args.through_day), args.reviewed_queue_sha256, args.videos)
