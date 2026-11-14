"""Record an explicit one-time post receipt locally; never call remote services."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

os.umask(0o077)
ROOT = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Pass the explicit application receipt path')
receipt_path = Path(sys.argv[1]).resolve()
assert receipt_path.is_relative_to(ROOT / 'migration'), 'Expected a migration receipt'
receipt = json.loads(receipt_path.read_text())
folder = receipt_path.parent
payload = json.loads((folder / 'posts.json').read_text())
assert receipt['environment'] == 'development'
assert receipt['payloadSha256'] == hashlib.sha256((folder / 'posts.json').read_bytes()).hexdigest()
posts = {p['sourceId']: p for p in payload['posts']}
assert receipt['verifiedPosts'] == len(posts) == len(receipt['records'])
assert receipt['verifiedFiles'] == len(payload['assets'])
assert receipt['afterPosts'] == receipt['inserted'] == len(posts)
with sqlite3.connect(ROOT / 'archive.sqlite3') as conn:
    conn.execute('PRAGMA foreign_keys=ON')
    for item in receipt['records']:
        post = posts[item['sourceId']]
        source = conn.execute("SELECT raw_path,raw_sha256 FROM source_items WHERE source='daum-cafe' AND container_id='1Tcxq' AND kind='post' AND source_id=?", (item['sourceId'],)).fetchone()
        assert source, item['sourceId']
        path = Path(source[0])
        if not path.is_absolute(): path = ROOT / path
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source[1] == item['sourceSha256'] == post['sourceSha256']
        detail = {'destination': 'posts', 'receipt': str(receipt_path.relative_to(ROOT)), 'sourceSha256': item['sourceSha256'], 'preparedPayload': str((folder / 'posts.json').relative_to(ROOT)), 'applicationVerification': 'new-db-connection-and-storage-download-sha256', 'runtimeVerified': False}
        conn.execute('''INSERT INTO migration_items
          (source,container_id,kind,source_id,target_environment,category_name,target_post_id,status,detail_json,applied_content_sha256,applied_at)
          VALUES ('daum-cafe','1Tcxq','post',?,?,?,?,'applied',?,?,?)
          ON CONFLICT(source,container_id,kind,source_id,target_environment) DO UPDATE SET
          category_name=excluded.category_name,target_post_id=excluded.target_post_id,status=excluded.status,
          detail_json=excluded.detail_json,applied_content_sha256=excluded.applied_content_sha256,applied_at=excluded.applied_at''',
          (item['sourceId'], receipt['environment'], item['categoryName'], item['targetPostId'], json.dumps(detail, ensure_ascii=False), item['contentSha256'], receipt['appliedAt']))
    print({'recordedPosts': len(posts), 'environment': receipt['environment']})
