"""Classify the complete Daum backup; no remote or application writes."""
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3

os.umask(0o077)
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'daum-dkkmob'
OUT = ROOT / 'migration/final'
EXCLUDED_SOURCE_IDS = {'dcAw:10', 'dcAw:9'}

# Route by original board identity, independently of earlier test application state.
ROUTES = {
    'dcAw': ('게시판', 'posts', 'notice', 'approved-member'),
    'dcAx': ('게시판', 'posts', None, 'approved-member'),
    'eiq': ('게시판', 'posts', 'free', 'approved-member'),
    'dbpk': ('게시판', 'posts', 'news', 'approved-member'),
    'dbpl': ('게시판', 'posts', 'free', 'approved-member'),
    'dbpm': ('게시판', 'heritage-officers', None, 'public'),
    'dbpp': ('동창회 소개', 'heritage-presidents-greetings', None, 'public'),
    'dbpt': ('동창회 소개', 'current-executives', None, 'public'),
    'dbrD': ('동창회 소개', 'heritage-officers', None, 'public'),
    'dbpr': ('동창회 소개', 'heritage-college-history', None, 'public'),
    'dbpq': ('동창회 소개', 'past-bylaws', None, 'public'),
    'eir': (None, 'heritage-albums', None, 'approved-member'),
    'eis': (None, 'questions', None, 'approved-member'),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    index_path = SOURCE / 'index.json'
    index = json.loads(index_path.read_text())
    permissions = {b['boardId']: b['label'] for b in json.loads((SOURCE / 'permissions.json').read_text())['boards']}
    with sqlite3.connect(f'file:{ROOT / "archive.sqlite3"}?mode=ro', uri=True) as conn:
        sources = dict(conn.execute("SELECT source_id,raw_sha256 FROM source_items WHERE source='daum-cafe' AND container_id='1Tcxq' AND kind='post'"))
        applications = {r[0]: {'status': r[1], 'detail': json.loads(r[2])} for r in conn.execute("SELECT source_id,status,detail_json FROM migration_items WHERE source='daum-cafe' AND container_id='1Tcxq' AND target_environment='development'")}
    items, failures, seen, boards = [], [], set(), []
    for board in index['boards']:
        route = ROUTES.get(board['id'])
        boards.append({'boardId': board['id'], 'board': board['title'], 'sourceRecords': len(board['posts']), 'parentMenu': route[0] if route else None, 'destination': route[1] if route else None})
        for listed in board['posts'].values():
            source_id = board['id'] + ':' + str(listed['id'])
            try:
                if source_id in seen:
                    raise ValueError('duplicate-source-id')
                seen.add(source_id)
                if route is None:
                    raise ValueError('unclassified-board')
                path = SOURCE / listed['backup']['file']
                sha = digest(path)
                expected = listed['backup']['sha256']
                if sha != expected or sources.get(source_id) != sha:
                    raise ValueError(f'source-hash-mismatch:index={expected},sqlite={sources.get(source_id)},actual={sha}')
                record = json.loads(path.read_text())
                if record['boardId'] != board['id'] or str(record['postId']) != str(listed['id']):
                    raise ValueError('source-identity-mismatch')
                parent, destination, category, access = route
                excluded = source_id in EXCLUDED_SOURCE_IDS
                if excluded:
                    destination, category, access = 'excluded', None, None
                if destination == 'posts' and category is None:
                    raise ValueError('event-record-needs-explicit-category')
                items.append({
                    'sourceId': source_id, 'sourceFile': str(path.relative_to(ROOT)), 'sourceSha256': sha,
                    'parentMenu': parent, 'boardId': board['id'], 'board': board['title'],
                    'boardPath': [p for p in [parent, board['title']] if p],
                    'sourceUrl': record['sourceUrl'], 'destination': destination,
                    'categoryName': category, 'targetAccess': access,
                    'exclusionReason': 'user-requested-exclusion' if excluded else None,
                    'academicTag': board['id'] in ('eiq', 'dbpl'),
                    'sourceReadPermission': permissions.get(board['id']),
                    'historicalDevelopmentApplication': applications.get(source_id),
                })
            except (KeyError, ValueError, OSError) as error:
                failures.append({'sourceId': source_id, 'stage': 'classification', 'reason': str(error)})
    unexpected = sorted(set(sources) - seen)
    failures.extend({'sourceId': s, 'stage': 'classification', 'reason': 'sqlite-source-not-in-index'} for s in unexpected)
    result = {
        'schemaVersion': 2, 'platform': 'daum-cafe', 'containerId': '1Tcxq',
        'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceIndexSha256': digest(index_path), 'policyVersion': 'confirmed-board-routing-v3',
        'boards': boards, 'items': items, 'failures': failures,
        'counts': {'sourceRecords': len(seen), 'classified': len(items), 'excluded': sum(x['destination'] == 'excluded' for x in items),
                   'migrationTargets': sum(x['destination'] != 'excluded' for x in items), 'failed': len(failures),
                   'destinations': dict(collections.Counter(x['destination'] for x in items)),
                   'postCategories': dict(collections.Counter(x['categoryName'] for x in items if x['destination'] == 'posts'))},
        'remoteWrites': 0,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'classification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts'], ensure_ascii=False))
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
