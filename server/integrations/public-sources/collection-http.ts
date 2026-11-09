import dns from 'node:dns';
import { setMaxListeners } from 'node:events';
import { assertSafeSourceUrl } from '../../modules/events/event-source-policy';
import { requestPublicAddress, resolvePublicAddress } from './public-page-fetcher';
import { LIMITS } from './collection-contract';

export type PublicBytes={url:string;contentType:string;body:Buffer};
export class CollectionBudget {
  requests=0;bytes=0; readonly signal:AbortSignal;
  constructor(signal?:AbortSignal) {
    this.signal=signal?AbortSignal.any([signal,AbortSignal.timeout(LIMITS.totalMs)]):AbortSignal.timeout(LIMITS.totalMs);
    // The bounded parallel asset requests share one cancellation signal.
    setMaxListeners(LIMITS.requests*2,this.signal);
  }
  async read(raw:string,asset=false):Promise<PublicBytes> {
    let url=assertSafeSourceUrl(raw);
    for(let redirects=0;redirects<=3;redirects++) {
      if(!permittedBrowserRequest(url.href,'GET','document'))throw Error('collection_not_public_read');
      this.signal.throwIfAborted();
      if(++this.requests>LIMITS.requests)throw Error('collection_request_limit');
      const address=await resolvePublicAddress(url,dns.promises.lookup,this.signal);
      const response=await requestPublicAddress(url,address.address,address.family,this.signal,'*/*');
      const header=(name:string)=>{const v=response.headers[name];return Array.isArray(v)?v[0]:v;};
      const iterator=response.body[Symbol.asyncIterator]();
      try {
        if([301,302,303,307,308].includes(response.status)) {
          const next=header('location');if(!next)throw Error('collection_redirect_missing');
          url=assertSafeSourceUrl(new URL(next,url).href);continue;
        }
        if(response.status<200||response.status>=300)throw Error('collection_http_'+response.status);
        if(header('content-encoding')&&!/^identity$/i.test(header('content-encoding')!))throw Error('collection_compressed_response');
        const contentType=(header('content-type')||'').split(';')[0].trim().toLowerCase();
        if(!/^(?:text\/(?:html|plain|css|javascript)|application\/(?:json|ld\+json|javascript|x-javascript)|image\/(?:png|jpeg|webp|gif|svg\+xml)|font\/(?:woff2?|ttf))$/.test(contentType))throw Error('collection_content_type');
        const limit=asset?LIMITS.assetBytes:LIMITS.dataBytes;
        if(Number(header('content-length')||0)>limit)throw Error('collection_response_limit');
        const chunks:Buffer[]=[];let size=0;
        while(true) {
          this.signal.throwIfAborted();const part=await iterator.next();if(part.done)break;
          size+=part.value.byteLength;this.bytes+=part.value.byteLength;
          if(size>limit||this.bytes>LIMITS.bytes)throw Error('collection_bytes_limit');
          chunks.push(Buffer.from(part.value));
        }
        return {url:url.href,contentType,body:Buffer.concat(chunks)};
      }finally{await iterator.return?.();}
    }
    throw Error('collection_redirect_limit');
  }
}
export function permittedBrowserRequest(url:string,method:string,resource:string):boolean {
  if(method!=='GET')return false;
  if(['websocket','media','manifest','other'].includes(resource))return false;
  const u=assertSafeSourceUrl(url);
  if(Array.from(u.searchParams.keys()).some(k=>/(?:auth|token|password|secret|session|signature|key)/i.test(k)))return false;
  return !/(?:^|\/)(?:login|logout|sign.?in|sign.?up|register|delete|remove|insert|update|save|send|payment|checkout|order|track|analytics)(?:\/|$)/i.test(u.pathname);
}
