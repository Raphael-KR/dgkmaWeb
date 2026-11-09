import type { NoticeData, NoticeFacts, NoticeFieldSource } from '@shared/contracts/notices';
import type { FieldEvidence } from '../../integrations/public-sources/collection-contract';

const comparable = (text: string) => text.normalize('NFKC').replace(new RegExp('[^\\p{L}\\p{N}]','gu'),'').toLowerCase();
/** Persist references, not a second copy of the source. Unmatched normalization remains explicit. */
export function noticeFieldSources(facts:NoticeFacts,input:string,evidence:FieldEvidence[]=[]):NoticeData['fieldSources'] {
  const user=comparable(input.replace(/https?:\/\/\S+/g,''));
  const result:NonNullable<NoticeData['fieldSources']>={};
  for(const [key,value] of Object.entries(facts)) {
    if(value===null||value===false||Array.isArray(value)&&!value.length||key==='questions')continue;
    const field=key as keyof NoticeFacts;
    const values=typeof value==='string'?[comparable(value)]:Array.isArray(value)?value.flatMap(v=>typeof v==='string'?[comparable(v)]:Object.values(v).filter(x=>typeof x==='string').map(x=>comparable(x as string))):[];
    if(values.length&&values.every(v=>v&&user.includes(v))) {result[field]=[{kind:'user',locator:'author-input'}];continue;}
    const found=evidence.filter(e=>values.length&&values.every(v=>v&&(e.field===key||e.field==='sourceText'&&v.length>=4)&&comparable(e.value).includes(v)));
    const refs:NoticeFieldSource[]=found.slice(0,8).map(({kind,url,locator,collectedAt})=>({kind,url,locator,collectedAt}));
    result[field]=refs.length?refs:[{kind:'unresolved'}];
  }
  return result;
}
