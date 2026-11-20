"""Prepare final Tiptap documents and allowed files; no remote writes."""
import collections
import datetime
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sqlite3
import tarfile
from urllib.parse import urljoin, urlparse
import uuid
import zipfile
import unicodedata

os.umask(0o077)
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'daum-dkkmob'
OUT=ROOT/'migration/final/posts'
OUT.mkdir(parents=True,exist_ok=True)
NAMESPACE=uuid.UUID('8dd714fe-3fa9-4f72-a414-57f94e94377e')
assets={}; results=[]; warnings=[]; failures=[]; reused=0; regenerated=0
CACHE=OUT/'cache'
CACHE.mkdir(parents=True,exist_ok=True)
class Node:
    def __init__(self,tag='root',attrs=None,text=''):
        self.tag=tag;self.attrs=attrs or {};self.text=text;self.children=[]
class Tree(HTMLParser):
    def __init__(self,html):
        super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root];self.feed(html)
    def handle_starttag(self,tag,attrs):
        n=Node(tag,dict(attrs));self.stack[-1].children.append(n)
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if self.stack[-1].tag==tag:self.stack.pop()
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,value):self.stack[-1].children.append(Node('#text',text=value))
def plain(node):
    if node.tag in ('script','style','noscript'):return ''
    return node.text if node.tag=='#text' else ''.join(plain(c) for c in node.children)
def text(value,marks=None):
    return {'type':'text','text':value,**({'marks':marks} if marks else {})}
def para(nodes=None):return {'type':'paragraph',**({'content':nodes} if nodes else {})}
def blocks(items):
    out=[];inline=[]
    def flush():
        if inline:
            if any(n.get('text','').strip() or n['type']=='hardBreak' for n in inline):out.append(para(inline.copy()))
            inline.clear()
    for node in items:
        if node['type'] in ('text','hardBreak'):inline.append(node)
        else:flush();out.append(node)
    flush()
    return out

def add_asset(path,name,mime,expected):
    data=path.read_bytes();sha=hashlib.sha256(data).hexdigest();assert sha==expected,('asset-hash-mismatch',path.name,expected,sha)
    id=str(uuid.uuid5(NAMESPACE,sha));entry={'id':id,'sha256':sha,'bytes':len(data),'name':name,'contentType':mime,'objectPath':'/objects/uploads/'+id}
    if id in assets:assert assets[id]['sha256']==sha
    else:assets[id]={**entry,'localPath':str(path.resolve())}
    return entry

def safe_href(href,base):
    href=urljoin(base,href or '')
    u=urlparse(href)
    return href if u.scheme in ('http','https','mailto','tel') and not re.search(r'[\x00-\x20\x7f]',href) and not u.username and not u.password else None

with sqlite3.connect(f'file:{ROOT/"archive.sqlite3"}?mode=ro',uri=True) as con:
    conversions={h:{'path':Path(p) if Path(p).is_absolute() else ROOT/p,'sha':sha,'status':status} for h,p,sha,status in con.execute('SELECT source_asset_sha256,output_path,output_sha256,status FROM conversions')}
receipts=[json.loads(p.read_text()) for p in (ROOT/'conversions').rglob('*.receipt.json')]
plan=json.loads((ROOT/'migration/final/classification.json').read_text())
assert plan['platform']=='daum-cafe' and plan['containerId']=='1Tcxq'
assert plan['sourceIndexSha256']==hashlib.sha256((SOURCE/'index.json').read_bytes()).hexdigest()
rows=[item for item in plan['items'] if item['destination']=='posts']
assert len({item['sourceId'] for item in rows})==len(rows)

def prepare(item):
    path=SOURCE/'posts'/(item['sourceId'].replace(':','-')+'.json');row=json.loads(path.read_text());warn=[];missing=[]
    times=re.findall(r'<span[^>]*class="txt_item"[^>]*>\s*(\d{2}\.\d{2}\.\d{2} \d{2}:\d{2})\s*</span>',row['pageHtml'])
    assert len(times)<=1,(item['sourceId'],'ambiguous source timestamp',len(times))
    precision='minute' if times else 'day'
    timestamp=datetime.datetime.strptime(times[0] if times else row['listDate'],'%y.%m.%d %H:%M' if times else '%y.%m.%d').replace(tzinfo=datetime.timezone(datetime.timedelta(hours=9)))
    assert timestamp.date()<datetime.datetime.now(timestamp.tzinfo).date()
    images={r['source']:r for r in row['resources']}
    def convert(node,marks=None):
        marks=list(marks or [])
        if node.tag in ('script','style','noscript'):return []
        if node.tag=='#text':
            value=re.sub(r'\s+',' ',node.text)
            return [text(value,marks)] if value else []
        mark={'b':'bold','strong':'bold','i':'italic','em':'italic','u':'underline','s':'strike','del':'strike','strike':'strike','code':'code'}.get(node.tag)
        if mark and not any(m['type']==mark for m in marks):marks.append({'type':mark})
        # Map only style meanings already supported by the installed editor schema.
        css={}
        for declaration in node.attrs.get('style','').split(';'):
            if ':' in declaration:
                key,value=declaration.split(':',1)
                css[key.strip().lower()]=re.sub(r'\s*!important\s*$','',value.strip().lower())
        def set_mark(kind,enabled):
            nonlocal marks
            marks=[m for m in marks if m['type']!=kind]
            if enabled:marks.append({'type':kind})
        weight=css.get('font-weight','')
        if weight in ('bold','bolder') or (weight.isdigit() and int(weight)>=500):set_mark('bold',True)
        elif weight=='normal' or (weight.isdigit() and int(weight)<500):set_mark('bold',False)
        if css.get('font-style') in ('italic','oblique'):set_mark('italic',True)
        elif css.get('font-style')=='normal':set_mark('italic',False)
        decoration=css.get('text-decoration-line',css.get('text-decoration','')).split()
        if 'underline' in decoration:set_mark('underline',True)
        if 'line-through' in decoration:set_mark('strike',True)
        if node.tag=='sup':warn.append('superscript-rendered-as-plain-text')
        if node.tag=='a':
            href=safe_href(node.attrs.get('href'),row['sourceUrl'])
            if href:marks=[m for m in marks if m['type']!='link']+[{'type':'link','attrs':{'href':href,'target':'_blank','rel':'noopener noreferrer','class':None}}]
        if node.tag=='br':return [{'type':'hardBreak'}]
        if node.tag=='hr':return [{'type':'horizontalRule'}]
        if node.tag=='pre':
            value=plain(node)
            return [{'type':'codeBlock',**({'content':[text(value)]} if value else {})}]
        if node.tag=='img':
            src=node.attrs.get('src','');asset=images.get(src)
            if 'icon.hanmail.net/editor/' in src:return []
            if asset and asset['status']=='saved' and asset.get('contentType','').startswith('image/'):
                meta=add_asset(SOURCE/asset['file'],Path(asset['file']).name,asset['contentType'],asset['sha256'])
                return [{'type':'image','attrs':{'src':meta['objectPath'],'alt':node.attrs.get('alt') or None}}]
            message='[원본에서 이미지를 확보하지 못했습니다.]';missing.append(message)
            warn.append('source-image-unavailable');return [text(message)]
        if node.tag=='table':
            def rows_in(n):
                if n.tag=='tr':return [n]
                if n.tag in ('table','tbody','thead','tfoot'):return [x for c in n.children for x in rows_in(c)]
                return []
            table_rows=[]
            for tr in rows_in(node):
                cells=[]
                for td in tr.children:
                    if td.tag not in ('td','th'):continue
                    attrs={key:int(td.attrs.get(key) or '1') for key in ('colspan','rowspan')}
                    content=blocks([n for c in td.children for n in convert(c,marks)]) or [para()]
                    cells.append({'type':'tableHeader' if td.tag=='th' else 'tableCell','attrs':attrs,'content':content})
                if cells:table_rows.append({'type':'tableRow','content':cells})
            if not table_rows:return []
            if all(c['attrs']['rowspan']==1 for r in table_rows for c in r['content']):
                width=max(sum(c['attrs']['colspan'] for c in r['content']) for r in table_rows)
                for r in table_rows:
                    gap=width-sum(c['attrs']['colspan'] for c in r['content'])
                    if gap:warn.append('implicit-empty-table-cells');r['content'].extend({'type':'tableCell','content':[para()]} for _ in range(gap))
            return [{'type':'table','content':table_rows}]
        children=[n for c in node.children for n in convert(c,marks)]
        if node.tag in ('h1','h2','h3','h4'):
            return [{'type':'heading','attrs':{'level':int(node.tag[1])},'content':children}]
        if node.tag=='blockquote':return [{'type':'blockquote','content':blocks(children) or [para()]}]
        if node.tag=='li':
            content=blocks(children)
            if not content or content[0]['type']!='paragraph':content.insert(0,para())
            return [{'type':'listItem','content':content}]
        if node.tag in ('ul','ol'):
            if not children:return []
            attrs={}
            if node.tag=='ol':
                start=node.attrs.get('start','1')
                attrs={'start':int(start) if re.fullmatch(r'[0-9]+',start) and int(start)>0 else 1}
            return [{'type':'orderedList' if node.tag=='ol' else 'bulletList',**({'attrs':attrs} if attrs else {}),'content':children}]
        if node.tag in ('p','div','h5','h6'):return blocks(children) or [para()]
        return children
    tree=Tree(row['contentHtml']);body=blocks([n for c in tree.root.children for n in convert(c)]) or [para()]
    def json_text(node):return node.get('text','')+''.join(json_text(c) for c in node.get('content',[]))
    converted=''.join(json_text(n) for n in body)
    for value in missing:converted=converted.replace(value,'',1)
    expected_text=re.sub(r'\s','',plain(tree.root));actual_text=re.sub(r'\s','',converted)
    first_difference=next((i for i,(a,b) in enumerate(zip(expected_text,actual_text)) if a!=b),min(len(expected_text),len(actual_text)))
    assert actual_text==expected_text,(item['sourceId'],'text-preservation',{'expectedCharacters':len(expected_text),'actualCharacters':len(actual_text),'firstDifference':first_difference,'privateTextExcluded':True})
    author=row.get('author')
    if not author:
        names=re.findall(r'<(?:a|span)[^>]*class="[^"]*(?:nick_name|txt_name|nickname)[^"]*"[^>]*>(.*?)</(?:a|span)>',row['pageHtml'],re.S)
        assert len(names)==1,(item['sourceId'],'ambiguous source author')
        author=plain(Tree(names[0]).root).strip()
    title=row['title']
    credited_author=re.fullmatch(r'(.+?)\s+/\s+([가-힣]{2,4})\s*',title)
    if author.strip()=='운영자' and credited_author:
        title,author=credited_author.group(1).rstrip(),credited_author.group(2)
    attachments=[]
    for original in row.get('files',[]):
        choices=[]
        if original['sha256'] in conversions:
            choices=[(conversions[original['sha256']],str(Path(original['name']).with_suffix('.hwpx')))]
        else:
            entries=[r for r in receipts if r.get('parentAssetSha256')==original['sha256']]
            assert entries,(item['sourceId'],'attachment conversion missing')
            names={}
            with zipfile.ZipFile(SOURCE/original['file']) as archive:
                for member in archive.infolist():
                    if member.is_dir():continue
                    name=member.filename if member.flag_bits & 0x800 else member.filename.encode('cp437').decode('cp949')
                    names[hashlib.sha256(archive.read(member)).hexdigest()]=unicodedata.normalize('NFC',Path(name).name)
            seen=set()
            for entry in entries:
                source_hash=entry['sourceSha256']
                if source_hash in seen:continue
                seen.add(source_hash)
                choices.append((conversions[source_hash],str(Path(names[source_hash]).with_suffix('.hwpx'))))
        for choice,name in choices:
            meta=add_asset(choice['path'],name,'application/hwp+zip',choice['sha']);attachments.append(meta)
    content=([para([text('#학술')])] if item['academicTag'] else [])+body
    if attachments:
        content.append({'type':'heading','attrs':{'level':3},'content':[text('첨부파일')]})
        for attachment in attachments:content.append(para([text(attachment['name'],[{'type':'link','attrs':{'href':attachment['objectPath']}}])]))
    return {'sourceId':item['sourceId'],'sourceUrl':row['sourceUrl'],'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'authorId':None,'authorName':author,
        'previousDevelopmentPostId':(item.get('historicalDevelopmentApplication') or {}).get('detail',{}).get('targetPostId'),
        'importData':{'schemaVersion':1,'platform':'daum-cafe','containerId':'1Tcxq','sourceId':item['sourceId'],
                      'boardPath':item['boardPath'],'url':row['sourceUrl'],'originalCreatedAt':timestamp.isoformat(),'timePrecision':precision},
        'title':title,'categoryName':item['categoryName'],'publishedAt':timestamp.astimezone(datetime.timezone.utc).isoformat(),
        'content':{'type':'doc','content':content},'imageUrls':[],'warnings':dict(collections.Counter(warn))}

def stable(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))

def digest(value):
    return hashlib.sha256(stable(value).encode()).hexdigest()

def refs(post):
    document=json.dumps(post['content'])
    return {key for key,asset in assets.items() if asset['objectPath'] in document}

tool_hash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
conversion_hash=digest({key:{**value,'path':str(value['path'])} for key,value in conversions.items()})
for item in rows:
    try:
        source_path=ROOT/item['sourceFile']
        actual=hashlib.sha256(source_path.read_bytes()).hexdigest()
        assert actual==item['sourceSha256'],('source-hash-mismatch',item['sourceSha256'],actual)
        input_hash=digest({'source':actual,'destination':item['destination'],'categoryName':item['categoryName'],
                           'boardPath':item['boardPath'],'academicTag':item['academicTag'],'tool':tool_hash,'conversions':conversion_hash})
        cache_path=CACHE/(item['sourceId'].replace(':','-')+'.json')
        cached=json.loads(cache_path.read_text()) if cache_path.exists() else None
        if cached and cached['inputSha256']==input_hash and digest(cached['post'])==cached['resultSha256']:
            post=cached['post']
            for key,asset in cached['assets'].items():
                actual_asset=hashlib.sha256(Path(asset['localPath']).read_bytes()).hexdigest()
                assert actual_asset==asset['sha256'],('cached-asset-hash-mismatch',key,asset['sha256'],actual_asset)
                assets[key]=asset
            reused+=1
        else:
            post=prepare(item)
            cache_path.write_text(json.dumps({'inputSha256':input_hash,'resultSha256':digest(post),'post':post,
                                             'assets':{key:assets[key] for key in refs(post)}},ensure_ascii=False,indent=2)+'\n')
            regenerated+=1
        if item['academicTag']:
            assert post['content']['content'][0]==para([text('#학술')]),'academic-first-paragraph-missing'
        results.append(post)
        if post['warnings']:warnings.append({'sourceId':item['sourceId'],'warnings':post['warnings']})
    except (AssertionError,KeyError,ValueError,OSError) as error:
        failures.append({'sourceId':item['sourceId'],'stage':'post-preparation','reason':str(error)})
expected={item['sourceId'] for item in rows}
assert {post['sourceId'] for post in results}|{item['sourceId'] for item in failures}==expected
used=set().union(*(refs(post) for post in results)) if results else set()
assets={key:value for key,value in assets.items() if key in used}
public_assets=[{k:v for k,v in assets[key].items() if k!='localPath'} for key in sorted(assets)]
(OUT/'posts.json').write_text(json.dumps({'schemaVersion':2,'platform':'daum-cafe','containerId':'1Tcxq','sourceIndexSha256':plan['sourceIndexSha256'],'posts':results,'assets':public_assets},ensure_ascii=False,indent=2)+'\n')
(OUT/'preparation.json').write_text(json.dumps({'expectedPosts':len(rows),'posts':len(results),'academicPosts':sum(item['academicTag'] for item in rows),'reused':reused,'regenerated':regenerated,'assets':len(assets),'warnings':warnings,'failures':failures},ensure_ascii=False,indent=2)+'\n')
with tarfile.open(OUT/'payload.tar','w') as tar:
    tar.add(OUT/'posts.json',arcname='posts.json')
    for id,meta in assets.items():tar.add(meta['localPath'],arcname='files/'+id)
print({'expectedPosts':len(rows),'posts':len(results),'academicPosts':sum(item['academicTag'] for item in rows),'reused':reused,'regenerated':regenerated,'assets':len(assets),'failures':len(failures),'warnings':dict(sum((collections.Counter(x['warnings']) for x in warnings),collections.Counter())), 'remoteWrites':0})
raise SystemExit(bool(failures or plan['failures']))
