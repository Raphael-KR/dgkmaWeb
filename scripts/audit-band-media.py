"""Build a private, offline inventory from the completed @dkom backup."""
import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import tempfile
from lib.band_comment_media import media_entry, read_receipts

COMMUNITY = Path(__file__).resolve().parents[1] / 'local-backups' / 'community'
SOURCE = COMMUNITY / 'band-11089836'
MIB = 1024 ** 2


def read_json(path):
    return json.loads(path.read_bytes())


def source_path(relative, directory):
    path = (SOURCE / relative).resolve()
    if not path.is_relative_to((SOURCE / directory).resolve()):
        raise ValueError(f'Expected a backup file under {directory}')
    return path


def verify(row, entry, cache):
    if entry.get('status') != 'saved':
        return
    path = source_path(entry['file'], 'assets')
    if path not in cache:
        if path.is_file():
            with path.open('rb') as data:
                cache[path] = (path.stat().st_size, hashlib.file_digest(data, 'sha256').hexdigest())
        else:
            cache[path] = (None, None)
    size, digest = cache[path]
    row.update(file=entry['file'], bytes=entry['bytes'], sha256=entry['sha256'])
    if (size, digest) == (entry['bytes'], entry['sha256']):
        row['verified'] = True
    else:
        row.update(verified=False, actualBytes=size, actualSha256=digest)
        row['issues'].append('size-or-hash-mismatch')


def asset(kind, source_id, entry, parents):
    row = dict(kind=kind, sourceId=str(source_id), parents=parents,
               status=entry.get('status', 'not-backed-up'), issues=[])
    if row['status'] != 'saved':
        row['issues'].append(entry.get('reason') or row['status'])
        if 'httpStatus' in entry:
            row['httpStatus'] = entry['httpStatus']
    return row


def photo_rows(catalog, media, post_ids):
    for key in sorted(catalog.keys() | media.keys()):
        photo = catalog.get(key, {})
        entry = media.get(key, {})
        parents = []
        pid = str(photo.get('post_no') or '')
        if pid:
            parents.append(dict(type='post', id=pid, inSnapshot=pid in post_ids))
        if photo.get('album_no'):
            parents.append(dict(type='album', id=str(photo['album_no'])))
        row = asset('photo', key, entry, parents)
        if not parents:
            row['issues'].append('unknown-parent')
        if pid and pid not in post_ids:
            row['issues'].append('parent-post-missing')
        if entry.get('bytes', 0) > 5 * MIB:
            row['issues'].append('over-image-upload-limit')
        if entry.get('contentType'):
            row['contentType'] = entry['contentType']
        if photo.get('album'):
            row['albumName'] = photo['album'].get('name')
        yield row, entry


def read_comments(details):
    for pid in sorted(details):
        data = read_json(source_path(f'comments/{pid}.json', 'comments'))
        if str(data['postNo']) != pid:
            raise ValueError(f'Comment backup parent mismatch for post {pid}')
        for page in data['pages']:
            for top in page['items']:
                top_id = str(top['comment_id'])
                top_key = f'post:{pid}/comment:{top_id}'
                yield dict(type='comment', id=top_id, postId=pid, sourceKey=top_key), top
                for reply in top.get('latest_comment', []):
                    if str(reply['origin_comment_id']) != top_id or str(reply['post_no']) != pid:
                        raise ValueError(f'Reply source parent does not match {top_key}')
                    reply_id = str(reply['comment_id'])
                    yield dict(type='comment', id=reply_id, postId=pid, parentSourceKey=top_key,
                               sourceKey=f'{top_key}/reply:{reply_id}'), reply


def gather(through):
    index = read_json(SOURCE / 'index.json')
    photo_index = read_json(SOURCE / 'photo-list-index.json')
    file_index = read_json(SOURCE / 'files-index.json')
    media = read_json(SOURCE / 'media-index.json')['photos']
    details = read_json(SOURCE / 'details-index.json')['posts']
    if index['source'] != 'https://band.us/@dkom' or str(index['bandNo']) != '11089836':
        raise ValueError('Unexpected BAND source or container')
    for name, checkpoint in [('posts', index), ('photos', photo_index), ('files', file_index)]:
        actual = checkpoint['daily']['coveredThrough']
        if actual != through or not checkpoint['complete']:
            raise ValueError(f'{name}: expected complete through {through}, got {actual}, complete={checkpoint["complete"]}')

    post_ids = set(index['posts'])
    file_refs, video_refs = defaultdict(list), defaultdict(list)
    observed = Counter()
    rows = []
    cache = {}

    def add(row, entry):
        verify(row, entry, cache)
        rows.append(row)

    for row, entry in photo_rows(photo_index['photos'], media, post_ids):
        add(row, entry)
    for pid, blob in index['posts'].items():
        post_path = (SOURCE / blob['file']).resolve()
        if not any(post_path.is_relative_to(SOURCE / folder) for folder in ('versions', 'posts')):
            raise ValueError(f'Unexpected source path for post {pid}')
        post = read_json(post_path)['sourceData']
        if str(post['post_no']) != pid:
            raise ValueError(f'Post ID mismatch for {pid}')
        for file in post['attachment'].get('file', []):
            file_refs[str(file['id'])].append(dict(type='post', id=pid))
        for video in post['attachment'].get('video', []):
            video_refs[str(video['id'])].append(dict(type='post', id=pid))

    # Unlike the post photo index, comments store a URL and no numeric photo ID.
    by_url = {r['source']: r for r in media.values() if r.get('source') and r.get('status') == 'saved'}
    comment_videos = {}
    receipts_by_post = {}
    for parent, comment in read_comments(details):
        pid = parent["postId"]
        if pid not in receipts_by_post:
            receipts_by_post[pid] = read_receipts(SOURCE, pid)
        receipts = receipts_by_post[pid]
        if comment.get('sticker'):
            observed['commentStickerReferences'] += 1
        for position, picture in enumerate(comment.get('photos', []), 1):
            url = picture.get('url') or ''
            cached = by_url.get(url, {})
            if not cached and url:
                sidecar = SOURCE / 'assets' / (hashlib.sha256(url.encode()).hexdigest() + '.json')
                if sidecar.is_file():
                    candidate = read_json(sidecar)
                    if candidate.get('source') == url:
                        cached = candidate
            key = f'{parent["sourceKey"]}/photo:{position}'
            cached = media_entry(receipts, key, url) or cached
            row = asset('comment-photo', key, cached, [parent])
            row['contentType'] = cached.get('contentType')
            add(row, cached)
        if comment.get('file'):
            file_refs[str(comment['file']['id'])].append(parent)
        if comment.get('video'):
            vid = str(comment['video']['id'])
            video_refs[vid].append(parent)
            entry = media_entry(receipts, parent['sourceKey'] + '/video:' + vid, comment['video']['logo_image'])
            if entry:
                comment_videos[vid] = entry
    for key in sorted(file_index['files'].keys() | file_refs.keys()):
        entry = file_index['files'].get(key, {})
        raw = entry.get('sourceData', {})
        parents = file_refs[key]
        row = asset('file', key, entry, parents)
        if not parents:
            row['issues'].append('origin-reference-missing')
        if raw.get('post_no') is not None and any(
                str(raw['post_no']) != p.get('postId', p['id']) for p in parents):
            row['issues'].append('parent-post-mismatch')
        ext = str(raw.get('extension', '')).lower()
        row.update(extension=ext, name=raw.get('file_name'))
        if ext == 'hwp':
            row['issues'].append('convert-to-hwpx')
        elif ext == 'zip':
            row['issues'].append('inspect-archive-members')
        elif ext not in {'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'hwpx', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv'}:
            row['issues'].append('unsupported-extension')
        limit = 5 if ext in {'jpg', 'jpeg', 'png', 'gif', 'webp'} else 10
        if entry.get('bytes', 0) > limit * MIB:
            row['issues'].append('over-file-upload-limit')
        add(row, entry)

    videos = dict(comment_videos)
    for pid, detail in details.items():
        for entry in detail['videos']:
            key = str(entry['videoId'])
            if key in videos and videos[key].get('sha256') != entry.get('sha256'):
                raise ValueError(f'Conflicting video snapshots for source ID {key}')
            videos[key] = entry
            if dict(type='post', id=pid) not in video_refs[key]:
                raise ValueError(f'Video {key} has no matching source attachment in post {pid}')
    for key in sorted(video_refs.keys() | videos.keys()):
        entry = videos.get(key, {})
        row = asset('video', key, entry, video_refs[key])
        row['issues'].append('video-upload-unsupported')
        add(row, entry)

    per_post = Counter()
    per_comment = Counter()
    for row in rows:
        for parent in row['parents']:
            if parent['type'] == 'comment':
                per_comment[parent['sourceKey']] += 1
            if parent['type'] == 'post' and parent['id'] in post_ids and row['status'] == 'saved':
                if row['kind'] == 'photo' or row.get('extension') in {'jpg','jpeg','png','gif','webp'}:
                    per_post[parent['id']] += 1
    over_limit = {pid: count for pid, count in per_post.items() if count > 40}
    return dict(containerId=index['bandNo'], throughDay=through, assets=rows,
                postImageCountsOver40=over_limit,
                commentAttachmentCountsOver1=[dict(sourceKey=key, count=n)
                                              for key, n in per_comment.items() if n > 1],
                photoListingReportedCount=photo_index['expected'],
                uniquePhotosInListing=len(photo_index['photos']),
                observed=observed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('through_day', type=date.fromisoformat,
                        help='completed KST checkpoint to audit, YYYY-MM-DD')
    through = str(parser.parse_args().through_day)
    result = gather(through)
    target = COMMUNITY / 'migration' / f'band-{through}'
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target, mode='w', encoding='utf-8', delete=False) as out:
        json.dump(result, out, ensure_ascii=False, separators=(',', ':'))
        out.write('\n')
    os.replace(out.name, target / 'media.json')
    counts = Counter((r['kind'], r['status']) for r in result['assets'])
    for (kind, status), n in sorted(counts.items()):
        print(f'{kind} {status}: {n}')
    corrupt = sum(r.get('verified') is False for r in result['assets'])
    print(f'File size or SHA-256 mismatches: {corrupt}')
    raise SystemExit(bool(corrupt))


if __name__ == '__main__':
    main()
