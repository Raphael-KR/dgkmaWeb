"""Prepare offline candidates for BAND post/comment attachments; never uploads files."""
import argparse
from collections import Counter
from datetime import date
from hashlib import file_digest, sha256
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'local-backups/community'
SOURCE = ROOT / 'band-11089836'
RHWP = ROOT / 'tools/rhwp-0.9.1/extracted/rhwp/rhwp'
IMAGE_TYPES = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
               'gif': 'image/gif', 'webp': 'image/webp'}
OFFICE_PARTS = {
    'docx': ('word/document.xml', 'wordprocessingml.document'),
    'xlsx': ('xl/workbook.xml', 'spreadsheetml.sheet'),
    'pptx': ('ppt/presentation.xml', 'presentationml.presentation'),
}
MIB = 1024 * 1024


class Rejected(ValueError):
    """A specific source cannot be attached under the current upload contract."""


def relative(path):
    return str(path.relative_to(ROOT))


def checked_name(value):
    name = unicodedata.normalize('NFC', value)
    if (not name or len(name.encode('utf-16le')) // 2 > 180 or name.strip() != name
            or any(c in '/\\' or unicodedata.category(c) in {'Cf', 'Cc', 'Cs'} for c in name)):
        raise Rejected('invalid-download-name')
    return name


def read_part(archive, name):
    if archive.getinfo(name).file_size > MIB:
        raise Rejected('archive-metadata-over-limit')
    return archive.read(name).decode('utf-8')


def modern_document(path, extension):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = set(archive.namelist())
        if (len(names) != len(infos) or len(infos) > 10_000
                or any(i.flag_bits & 1 or '\\' in i.filename or '..' in Path(i.filename).parts
                       or Path(i.filename).is_absolute() or i.filename.lower().endswith('/vbaproject.bin')
                       for i in infos)):
            raise Rejected('archive-entry-policy')
        if extension == 'hwpx':
            mime = 'application/hwp+zip'
            if (read_part(archive, 'mimetype').strip() != mime
                    or not {'Contents/header.xml', 'Contents/section0.xml'}.issubset(names)):
                raise Rejected('hwpx-package-parts')
            container = ET.fromstring(read_part(archive, 'META-INF/container.xml'))
            manifest = ET.fromstring(read_part(archive, 'Contents/content.hpf'))
            if (not any(n.get('full-path') == 'Contents/content.hpf' for n in container.iter())
                    or not any(re.fullmatch(r'(?:Contents/)?section\d+\.xml', n.get('href', ''))
                               for n in manifest.iter())):
                raise Rejected('hwpx-package-manifest')
            return mime
        part, suffix = OFFICE_PARTS[extension]
        mime = 'application/vnd.openxmlformats-officedocument.' + suffix
        types = ET.fromstring(read_part(archive, '[Content_Types].xml'))
        if part not in names or not any(e.get('PartName') == '/' + part and
                                        e.get('ContentType') == mime + '.main+xml' for e in types.iter()):
            raise Rejected('office-package-parts')
        if any(re.search(r'macroEnabled|vbaProject', e.get('ContentType', ''), re.I) for e in types.iter()):
            raise Rejected('office-macro')
        return mime


def identify(path, ext):
    with path.open('rb') as stream:
        header = stream.read(16)
    if ext in IMAGE_TYPES:
        signatures = [('image/jpeg', header.startswith(b'\xff\xd8\xff')),
                      ('image/png', header.startswith(b'\x89PNG\r\n\x1a\n')),
                      ('image/gif', header.startswith((b'GIF87a', b'GIF89a'))),
                      ('image/webp', header[:4] == b'RIFF' and header[8:12] == b'WEBP')]
        if (IMAGE_TYPES[ext], True) in signatures:
            return IMAGE_TYPES[ext]
    elif ext == 'pdf' and header.startswith(b'%PDF-'):
        return 'application/pdf'
    elif (ext in OFFICE_PARTS or ext == 'hwpx') and header.startswith(b'PK\x03\x04'):
        return modern_document(path, ext)
    elif ext in {'md', 'txt', 'csv'}:
        data = path.read_bytes()
        for encoding in (['utf-16'] if data[:2] in (b'\xff\xfe', b'\xfe\xff') else ['utf-8', 'cp949']):
            try:
                if not re.search(r'[\x00-\x08\x0b\x0e-\x1f\x7f]', data.decode(encoding)):
                    return 'text/csv' if ext == 'csv' else 'text/markdown' if ext == 'md' else 'text/plain'
            except UnicodeDecodeError:
                pass
        raise Rejected('text-encoding-or-controls')
    raise Rejected('extension-signature-mismatch')


def hwpx_attachment(payload, name, output, converter):
    digest = sha256(payload).hexdigest()
    out = output / (digest + '.hwpx')
    if not out.is_file():
        with tempfile.TemporaryDirectory(dir=output) as tmp:
            infile, outfile = Path(tmp) / 'input.hwp', Path(tmp) / 'output.hwpx'
            infile.write_bytes(payload)
            try:
                proc = subprocess.run([str(converter), 'export-hwpx', str(infile), str(outfile)],
                                      capture_output=True, timeout=90, cwd=tmp)
            except subprocess.TimeoutExpired:
                raise Rejected('conversion-timeout') from None
            if proc.returncode or not outfile.is_file():
                raise Rejected(f'conversion-failed-exit-{proc.returncode}')
            identify(outfile, 'hwpx')
            outfile.replace(out)
    return out, checked_name(str(Path(checked_name(name)).with_suffix('.hwpx')))


def eligible_attachment(row, path, name):
    name = checked_name(name)
    ext = Path(name).suffix.lower().lstrip('.')
    size = path.stat().st_size
    if not 0 < size <= (5 if ext in IMAGE_TYPES else 10) * MIB:
        raise Rejected('attachment-size-outside-limit')
    mime = identify(path, ext)
    with path.open('rb') as stream:
        digest = file_digest(stream, 'sha256').hexdigest()
    return dict(**row, file=relative(path), name=name, bytes=size, sha256=digest, contentType=mime,
                destination='image' if mime.startswith('image/') else 'document')

def jpeg_pixels(path):
    # The PPM stream includes the dimensions before the unscaled RGB pixels.
    with tempfile.TemporaryFile() as pixels:
        subprocess.run(['djpeg', '-rgb', str(path)], stdout=pixels, stderr=subprocess.DEVNULL,
                       check=True, timeout=90)
        pixels.seek(0)
        return file_digest(pixels, 'sha256').hexdigest()


def prepare_oversized_jpeg(path, output, source_hash):
    identify(path, 'jpg')
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as tmp:
        result = Path(tmp) / 'image.jpg'
        try:
            subprocess.run(['jpegtran', '-copy', 'all', '-optimize', '-progressive', '-outfile',
                            str(result), str(path)], stderr=subprocess.DEVNULL, check=True, timeout=90)
            if not 0 < result.stat().st_size <= 5 * MIB:
                raise Rejected('attachment-size-outside-limit')
            pixels = jpeg_pixels(path)
            if jpeg_pixels(result) != pixels:
                raise Rejected('jpeg-pixels-differ')
        except (FileNotFoundError, subprocess.SubprocessError) as exc:
            raise Rejected('jpeg-lossless-processing-unavailable') from exc
        with result.open('rb') as stream:
            result_hash = file_digest(stream, 'sha256').hexdigest()
        staged = output / (result_hash + '.jpg')
        result.replace(staged)
    return staged, dict(inputSha256=source_hash, decodedPixelSha256=pixels)


def video_orders(index, post_id):
    source = (SOURCE / index[post_id]['file']).resolve()
    if not any(source.is_relative_to(SOURCE / folder) for folder in ('posts', 'versions')):
        raise ValueError('Video post source outside archive')
    raw = source.read_bytes()
    if sha256(raw).hexdigest() != index[post_id]['sha256']:
        raise ValueError(f'Changed source post: {post_id}')
    row = json.loads(raw)['sourceData']
    if str(row['post_no']) != post_id:
        raise ValueError(f'Wrong source post: {post_id}')
    source_ids = [str(video['id']) for video in row['attachment'].get('video', [])]
    if len(set(source_ids)) != len(source_ids):
        raise ValueError(f'Duplicate video in post: {post_id}')
    return {vid: n for n, vid in enumerate(source_ids)}


def check_mp4(path, expected_size):
    # ISO BMFF files may have either 32-bit or extended 64-bit box sizes.
    boxes = set()
    pos = 0
    with path.open('rb') as stream:
        while pos < expected_size:
            stream.seek(pos)
            header = stream.read(8)
            if len(header) != 8:
                raise Rejected('truncated-video-box')
            size, kind = int.from_bytes(header[:4], 'big'), header[4:]
            head_size = 8
            if size == 1:
                size = int.from_bytes(stream.read(8), 'big')
                head_size = 16
            elif size == 0:
                size = expected_size - pos
            if size < head_size or pos + size > expected_size:
                raise Rejected('invalid-video-box-size')
            if pos == 0:
                if kind != b'ftyp' or size < head_size + 8 or size > 4096:
                    raise Rejected('missing-video-file-type')
                brands = stream.read(size - head_size)
                permitted = {b'isom', b'iso2', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1'}
                if brands[:4] not in permitted:
                    raise Rejected('unsupported-mp4-brand')
            pos += size
            boxes.add(kind)
    if pos != expected_size or not {b'mdat', b'moov'}.issubset(boxes):
        raise Rejected('missing-video-track-or-media')

def prepare(day, converter):
    os.umask(0o077)
    folder = ROOT / 'migration' / f'band-{day}'
    media_bytes = (folder / 'media.json').read_bytes()
    media = json.loads(media_bytes)
    if str(media['containerId']) != '11089836' or media['throughDay'] != day:
        raise ValueError(f'Media inventory is outside expected BAND or cutoff {day}')
    version = subprocess.run([str(converter), '--version'], check=True, capture_output=True,
                             text=True).stdout.strip()
    if not re.fullmatch(r'rhwp v[\d.]+', version):
        raise ValueError('Unrecognized local rhwp version')
    converted = folder / 'converted' / version.split()[-1]
    converted.mkdir(mode=0o700, parents=True, exist_ok=True)
    rows, held, videos = [], [], []
    post_index = json.loads((SOURCE / 'index.json').read_bytes())['posts']
    orders = {}
    source_counts = Counter()
    converted_members = Counter()
    expected_post_documents = Counter()

    def candidate(info, path, name, source_hash=None):
        try:
            if (source_hash and Path(name).suffix.lower() in ('.jpg', '.jpeg')
                    and path.stat().st_size > 5 * MIB):
                path, proof = prepare_oversized_jpeg(path, folder / 'converted/jpeg', source_hash)
                info = {**info, **proof}
            rows.append(eligible_attachment(info, path, name))
        except (Rejected, zipfile.BadZipFile, KeyError, ET.ParseError, UnicodeError) as exc:
            held.append({**info, 'reason': str(exc) if isinstance(exc, Rejected) else type(exc).__name__})

    def convert(info, payload, name):
        if info['parent']['type'] == 'post':
            expected_post_documents[info['parent']['id']] += 1
        marker = re.match(rb'HWP Document File V([0-9.]+) ', payload)
        info = {**info, 'originalName': name, 'inputSha256': sha256(payload).hexdigest(),
                'inputFormat': 'HWP-' + marker.group(1).decode() if marker else 'HWP-OLE'}
        try:
            output, result_name = hwpx_attachment(payload, name, converted, converter)
            candidate(info, output, result_name)
            converted_members['prepared'] += 1
        except (Rejected, zipfile.BadZipFile, KeyError, ET.ParseError, UnicodeError) as exc:
            held.append({**info, 'reason': str(exc) if isinstance(exc, Rejected) else type(exc).__name__})
            converted_members['failed'] += 1

    for entry in media['assets']:
        key, kind = entry['sourceId'], entry['kind']
        info = dict(sourceId=key, kind=kind, parents=entry['parents'])
        if entry['status'] != 'saved' or not entry.get('verified'):
            held.append({**info, 'reason': 'source-' + entry['status'] if entry['status'] != 'saved' else 'unverified-bytes'})
            continue
        parents = [p for p in entry['parents'] if p['type'] in ('post', 'comment') and p.get('inSnapshot', True)]
        if len(parents) != 1:
            held.append({**info, 'reason': 'album-only' if not parents and any(p['type']=='album' for p in info['parents']) else 'missing-or-ambiguous-parent'})
            continue
        parent = parents[0]
        # The audit retains optional overlapping album membership. Only the post/comment is a candidate here.
        info = dict(sourceId=key, kind=kind, parent=parent)
        if any(reason in entry['issues'] for reason in ['parent-post-mismatch', 'origin-reference-missing']):
            held.append({**info, 'reason': 'source-parent-mismatch'})
            continue
        source = (SOURCE / entry['file']).resolve()
        if not source.is_relative_to(SOURCE / 'assets'):
            raise ValueError('Source asset path is outside the private assets directory')
        with source.open('rb') as stream:
            digest = file_digest(stream, 'sha256').hexdigest()
        if (source.stat().st_size, digest) != (entry['bytes'], entry['sha256']):
            held.append({**info, 'reason': 'source-bytes-changed', 'expectedSha256': entry['sha256'], 'actualSha256': digest})
            continue
        if kind == 'video':
            if parent['type'] == 'comment':
                try:
                    check_mp4(source, entry['bytes'])
                    rows.append({**info, 'file': relative(source), 'sha256': digest, 'bytes': entry['bytes'],
                                 'name': f'band-comment-video-{key}.mp4', 'contentType': 'video/mp4',
                                 'destination': 'video'})
                except Rejected as exc:
                    held.append({**info, 'reason': str(exc)})
                continue
            if parent['type'] != 'post' or parent['id'] not in post_index:
                held.append({**info, 'reason': 'video-parent-unavailable'})
                continue
            pid = parent['id']
            if pid not in orders:
                orders[pid] = video_orders(post_index, pid)
            if key not in orders[pid]:
                held.append({**info, 'reason': 'video-source-id-not-attached'})
                continue
            try:
                check_mp4(source, entry['bytes'])
                videos.append({**info, 'position': orders[pid][key], 'file': relative(source),
                               'sha256': digest, 'bytes': entry['bytes'], 'contentType':'video/mp4'})
            except Rejected as exc:
                held.append({**info, 'reason': str(exc)})
            continue
        if kind in ('photo', 'comment-photo'):
            expected_ext = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'}.get(entry['contentType'])
            if not expected_ext:
                held.append({**info, 'reason': 'unsupported-image-type'})
                continue
            label = f'band-photo-{key}' if kind == 'photo' else f'band-comment-photo-{digest}'
            candidate(info, source, f'{label}.{expected_ext}', digest)
        elif kind == 'file':
            ext, name = entry['extension'], entry['name']
            if ext == 'hwp':
                convert(info, source.read_bytes(), name)
            elif ext == 'zip':
                if entry['bytes'] > 10 * MIB:
                    held.append({**info, 'reason':'zip-input-size-limit'})
                    continue
                try:
                    with zipfile.ZipFile(source, metadata_encoding='cp949') as archive:
                        members = [m for m in archive.infolist() if not m.is_dir()]
                        if len(members) > 10_000 or sum(m.file_size for m in members) > 100 * MIB:
                            raise Rejected('source-archive-limits')
                        for index, member in enumerate(members):
                            member_info = {**info, 'member': index}
                            if member.file_size > 10*MIB or member.flag_bits & 1:
                                held.append({**member_info, 'reason':'zip-member-size-or-encryption'})
                                continue
                            basename = Path(member.filename.replace('\\','/')).name
                            if Path(basename).suffix.lower() != '.hwp':
                                held.append({**member_info, 'reason':'unsupported-archive-member'})
                                continue
                            convert(member_info, archive.read(member), basename)
                except (Rejected, zipfile.BadZipFile, UnicodeError) as exc:
                    held.append({**info, 'reason':str(exc) if isinstance(exc, Rejected) else type(exc).__name__})
            else:
                if parent['type'] == 'post' and ext not in IMAGE_TYPES:
                    expected_post_documents[parent['id']] += 1
                candidate(info, source, name, digest)
        else:
            held.append({**info, 'reason':'unsupported-attachment-kind'})

    for item in rows:
        p = item['parent']
        source_counts[(p['type'], p.get('sourceKey', p['id']), item['destination'])] += 1
    ready = []
    for item in rows:
        p = item['parent']
        reason = None
        counts = source_counts[(p['type'], p.get('sourceKey', p['id']), item['destination'])]
        if p['type'] == 'post' and item['destination'] == 'image' and p['id'] in media['postImageCountsOver40']:
            reason = 'post-has-over-40-images'
        elif (p['type'] == 'post' and item['destination'] == 'document'
              and max(counts, expected_post_documents[p['id']]) > 5):
            reason = 'post-has-over-5-documents'
        if reason:
            held.append({**item, 'reason':reason})
        else:
            ready.append(item)
    return folder, dict(throughDay=day, containerId='11089836', stage='local-candidates',
                        sourceMediaSha256=sha256(media_bytes).hexdigest(), converter=version,
                        conversions=dict(converted_members), candidates=ready, videoCandidates=videos, held=held)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('through_day', type=date.fromisoformat)
    parser.add_argument('--rhwp', type=Path, default=RHWP)
    args = parser.parse_args()
    target, result = prepare(str(args.through_day), args.rhwp.resolve())
    with tempfile.NamedTemporaryFile('w', dir=target, encoding='utf-8', delete=False) as out:
        json.dump(result, out, ensure_ascii=False, separators=(',', ':'))
        out.write('\n')
    os.replace(out.name, target / 'attachment-candidates.json')
    print('Candidate counts:', dict(Counter(i['destination'] for i in result['candidates'])))
    print('Conversion outputs:', result['conversions'])
    print('Held counts:', dict(Counter(i['reason'] for i in result['held'])))
