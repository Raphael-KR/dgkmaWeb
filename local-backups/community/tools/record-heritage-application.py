"""Record an explicit verified album application in the local migration index."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Pass the explicit application receipt path')
receipt_path = Path(sys.argv[1]).resolve()
assert receipt_path.is_relative_to(ROOT / 'migration')
folder = receipt_path.parent
receipt = json.loads(receipt_path.read_text())
catalog_bytes = (folder / 'catalog.json').read_bytes()
assert receipt['environment'] == 'development' and receipt['catalogVerified']
assert hashlib.sha256(catalog_bytes).hexdigest() == receipt['catalogSha256']
assert receipt['verified'] == receipt['uniqueFiles']
catalog = json.loads(catalog_bytes)
photos = {photo['id']: photo for photo in catalog['photos']}
albums = {album['id']: album for album in catalog['albums']}
mapping = json.loads((folder / 'source-mapping.json').read_text())
conn = sqlite3.connect(ROOT / 'archive.sqlite3')
conn.execute('PRAGMA foreign_keys=ON')
try:
    conn.execute('BEGIN IMMEDIATE')
    for item in mapping:
        key = ('daum-cafe', '1Tcxq', 'post', item['sourceId'], receipt['environment'])
        source_hash = conn.execute('SELECT raw_sha256 FROM source_items WHERE source=? AND container_id=? AND kind=? AND source_id=?', key[:4]).fetchone()
        assert source_hash and source_hash[0] == item['sourceSha256']
        album = albums[item['albumId']]
        assets = [photos[id] for id in album['photoIds']]
        content_hash = hashlib.sha256(json.dumps({'album':album,'photos':assets},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        # The latest environment mapping follows this explicit run; old receipts remain.
        detail = {'destination':'heritage-albums', 'targetAlbumId':album['id'], 'catalogSha256':receipt['catalogSha256'], 'access':'approved-member', 'applicationVerification':'storage-download-sha256', 'runtimeVerified':False,'receipt':str(receipt_path.relative_to(ROOT))}
        conn.execute('''INSERT INTO migration_items
          (source,container_id,kind,source_id,target_environment,converted_assets_json,status,detail_json,applied_content_sha256,applied_at)
          VALUES (?,?,?,?,?,?,'applied',?,?,?) ON CONFLICT(source,container_id,kind,source_id,target_environment) DO UPDATE SET converted_assets_json=excluded.converted_assets_json,detail_json=excluded.detail_json,applied_content_sha256=excluded.applied_content_sha256,applied_at=excluded.applied_at,status=excluded.status''',
          (*key, json.dumps(assets,ensure_ascii=False), json.dumps(detail), content_hash, receipt['appliedAt']))
    conn.commit()
    print({'recorded':len(mapping),'integrity':conn.execute('PRAGMA integrity_check').fetchone()[0], 'appliedAlbums':conn.execute("SELECT count(*) FROM migration_items WHERE status='applied' AND json_extract(detail_json,'$.destination')='heritage-albums'").fetchone()[0]})
except:
    conn.rollback()
    raise
finally:
    conn.close()
