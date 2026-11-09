import type { NoticeType } from '@shared/contracts/notices';
import * as cheerio from 'cheerio';
import { extractPublicPageText } from './public-page-text';
import { jsonFields } from './collection-fields';
import { pageIdentity } from './collection-rules';
import type { FieldEvidence, JsonObservation } from './collection-contract';

/** Parse JSON literals only. Source JavaScript is never eval'ed in the app process. */
function jsonLiterals(script:string):unknown[] {
  const result:unknown[]=[];const trimmed=script.trim();
  if(trimmed.startsWith('{')||trimmed.startsWith('[')) {try{result.push(JSON.parse(trimmed));}catch{/* not JSON */}}
  const assignments=/(?:__NEXT_DATA__|__INITIAL_STATE__|__NUXT__|__PRELOADED_STATE__|initialState)\s*=\s*/g;
  for(const match of Array.from(script.matchAll(assignments)).slice(0,12)) {
    const start=match.index!+match[0].length;if(!['{','['].includes(script[start]))continue;
    let depth=0,quoted=false,escaped=false;
    for(let i=start;i<script.length&&i-start<512*1024;i++) {
      const c=script[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}if(c==='{'||c==='[')depth++;if(c==='}'||c===']')depth--;
      if(depth===0){try{result.push(JSON.parse(script.slice(start,i+1)));}catch{/* JS object is left to browser */}break;}
    }
  }
  return result.slice(0,12);
}
export function htmlSources(html:string,url:string,noticeType:NoticeType='obituary') {
  const $=cheerio.load(html);const evidence:FieldEvidence[]=[];const observations:JsonObservation[]=[];
  $('script').slice(0,30).each((_,element)=>{
    for(const value of jsonLiterals($(element).text())) {
      observations.push({url,value,origin:'html'});evidence.push(...jsonFields(value,url,'html',noticeType).evidence);
    }
  });
  const metadata=$('meta[property="og:description"],meta[name="description"],meta[property="og:title"]').map((_,e)=>$(e).attr('content')||'').get().join('\n');
  const text=[extractPublicPageText({contentType:'text/html',body:html}),metadata].filter(Boolean).join('\n').slice(0,20000);
  const scripts=$('script[src]').map((_,e)=>{try{return new URL($(e).attr('src')!,url).href;}catch{return '';}}).get().filter(Boolean).slice(0,8);
  const inline=$('script:not([src])').map((_,e)=>$(e).text()).get().join('\n').slice(0,512*1024);
  return {text,evidence,observations,scripts,inline};
}
export function explicitReadCandidates(script:string,page:string):string[] {
  const identity=pageIdentity(page);if(!identity)return [];
  const candidates=new Set<string>();
  // Only literals explicitly used by fetch/get, not invented routes or arbitrary string scanning.
  const pattern=/(?:fetch|(?:axios|client|http|api)\.get)\(\s*(["'`])([^"'`\n]{1,1000})\1/g;
  for(const match of Array.from(script.matchAll(pattern))) {
    // Default GET is only certain for a single-argument fetch. Options/dynamic requests are observed in Playwright.
    const tail=script.slice(match.index!+match[0].length);
    if(!/^\s*\)/.test(tail))continue;
    const literal=match[2].replace(/\$\{(?:id|params\.id|route\.params\.id)\}/g,encodeURIComponent(identity.value));
    if(literal.includes('${')||!literal.includes(identity.value))continue;
    try { const url=new URL(literal,page);if(url.origin===new URL(page).origin||/^https:\/\//.test(literal))candidates.add(url.href); } catch{/* not a URL */}
  }
  return Array.from(candidates).slice(0,6);
}
