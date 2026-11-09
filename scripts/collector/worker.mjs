// Dedicated Playwright process. Receives URLs and public response bytes only; no app imports or credentials.
import { chromium } from 'playwright-core';
import { createWorker } from 'tesseract.js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const require=createRequire(import.meta.url);
const pending=new Map();let sequence=0,apiReady=false,phase='launch';
const send=value=>process.send?.(value);
process.on('message',message=>{
  if(message.type==='response'){const callback=pending.get(message.id);pending.delete(message.id);callback?.(message);}
  if(message.type==='api-ready')apiReady=true;
  if(message.type==='start')run(message).then(result=>send({type:'result',result})).catch(()=>send({type:'failure',code:phase+'_failed'}));
});
function read(url,method,resource) {
  return new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);send({type:'request',id,url,method,resource});});
}
function meaningful(text,noticeType) {
  if(noticeType==='obituary')return /고인|故|별세|부고/.test(text)&&/발인/.test(text)&&/빈소|장례식장/.test(text);
  const dated=/\d{4}\s*[년./-]\s*\d{1,2}/.test(text);
  return dated&&(noticeType==='wedding'?/결혼|예식|신랑|신부|wedding/i.test(text)&&/장소|웨딩|예식장|홀|venue/i.test(text):/개원|opening/i.test(text)&&/한의원|clinic/i.test(text));
}
async function textOf(frame) {
  return frame.evaluate(()=>{
    const text=[];let nodes=0;
    function scan(root){
      if(++nodes>10000)return;
      if(root instanceof HTMLElement && root.innerText)text.push(root.innerText);
      for(const node of root.querySelectorAll('*')){if(++nodes>10000)break;if(node.shadowRoot)scan(node.shadowRoot);}
      if(root instanceof ShadowRoot)for(const node of root.children)if(node instanceof HTMLElement)text.push(node.innerText||'');
    }
    scan(document.body);return [...new Set(text)].join('\n').slice(0,20000);
  }).catch(()=> '');
}
async function run({url,executablePath,limits,noticeType='obituary'}) {
  let browser,ocr;
  const stop=()=>{void Promise.allSettled([browser?.close(),ocr?.terminate()]).finally(()=>process.exit(0));};
  process.once('SIGTERM',stop);
  const segments=[],images=[],stats={frames:0,interactions:0,scrolls:0,ocrImages:0};
  try {
    browser=await chromium.launch({executablePath,headless:true,chromiumSandbox:true,timeout:12000,
      env:process.env,args:['--disable-background-networking','--disable-component-update','--disable-extensions','--disable-features=WebRtcAllowInputVolumeAdjustment','--disable-webrtc','--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--renderer-process-limit=2','--js-flags=--max-old-space-size=192','--disable-dev-shm-usage']});
    const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,permissions:[],viewport:{width:1000,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul'});
    await context.routeWebSocket('**/*',socket=>socket.close());
    await context.route('**/*',async route=>{
      const request=route.request();
      try {
        const result=await read(request.url(),request.method(),request.resourceType());
        if(!result.ok){await route.abort('blockedbyclient');return;}
        if(result.url!==request.url()){await route.fulfill({status:302,headers:{location:result.url}});return;}
        await route.fulfill({status:200,headers:{'content-type':result.contentType,'access-control-allow-origin':'*','cache-control':'no-store'},body:Buffer.from(result.body,'base64')});
      }catch{await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();page.setDefaultTimeout(1200);
    phase='navigation';
    context.on('page',other=>{if(other!==page)void other.close();});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000}).catch(()=>{});
    for(let round=0;round<16;round++){
      const text=await textOf(page.mainFrame());
      if(/captcha|verify you are human|로그인이 필요|접근이 제한/i.test(text))return {segments:[],stats,blocked:true};
      if(apiReady||meaningful(text,noticeType))break;
      await page.waitForTimeout(350);
    }
    phase='render';
    const visited=new Set();
    while(visited.size<limits.frames) {
      const frame=page.frames().find(candidate=>!visited.has(candidate));if(!frame)break;visited.add(frame);
      if(!/^https?:/.test(frame.url()) && frame!==page.mainFrame())continue;
      stats.frames++;
      const capture=async()=>{
        const text=await textOf(frame);if(text)segments.push({url:frame.url()||url,text,kind:'rendered',locator:'body+open-shadow'});
        if(!apiReady&&!meaningful(text,noticeType)) {
          const accessible=await frame.locator('body').ariaSnapshot({timeout:800}).catch(()=> '');
          if(accessible)segments.push({url:frame.url()||url,text:accessible.slice(0,12000),kind:'rendered',locator:'accessibility-tree'});
        }
      };
      await capture();
      if(!apiReady) {
        for(let i=0;i<3;i++) {
          await frame.evaluate(()=>{
            window.scrollBy(0,700);
            const containers=Array.from(document.querySelectorAll('main,section,div')).filter(e=>e.scrollHeight>e.clientHeight+100&&/auto|scroll/.test(getComputedStyle(e).overflowY)).slice(0,3);
            containers.forEach(e=>e.scrollBy(0,700));
          }).catch(()=>{});
          stats.scrolls++;await page.waitForTimeout(200);
        }
        const controls=frame.locator('details:not([open]) > summary,[role="tab"],[aria-expanded="false"]');
        for(let i=0;i<Math.min(await controls.count(),limits.interactions);i++) {
          if(stats.interactions>=limits.interactions)break;
          const control=controls.nth(i);const label=(await control.innerText().catch(()=>''))+(await control.getAttribute('aria-label')||'');
          if(!/부고|상주|장례|발인|장지|상세|더보기|더 보기|안내|연락|계좌|정보|결혼|예식|신랑|신부|혼주|오시는|식사|주차|화환|개원|한의원|details|more|funeral|contact/i.test(label)||/주문|결제|로그인|보내기|등록|작성|order|pay|login|submit|delete/i.test(label))continue;
          await control.click({timeout:800}).then(()=>stats.interactions++).catch(()=>{});
          await page.waitForTimeout(150);await capture();
        }
        await capture();
      }
    }
    // Screenshots remain in memory. Only attempt OCR if API/text did not provide the event.
    if(!apiReady&&!segments.some(s=>meaningful(s.text,noticeType))) {
      for(const frame of page.frames().slice(0,limits.frames)) {
        const candidates=frame.locator('img,canvas');
        for(let i=0;i<Math.min(await candidates.count(),20)&&images.length<limits.images;i++) {
          const element=candidates.nth(i);const box=await element.boundingBox();
          if(!box||box.width<300||box.height<180||box.width*box.height>4_000_000)continue;
          const alt=await element.getAttribute('alt')||'';
          if(/logo|icon|로고|배너|광고/i.test(alt))continue;
          const data=await element.screenshot({type:'png',timeout:1200}).catch(()=>null);
          if(data&&data.length<4*1024*1024)images.push({data,url:frame.url(),locator:`image:${i}`});
        }
      }
    }
    await browser.close();browser=undefined;
    if(images.length) {
      phase='ocr';
      const langs=['kor','eng'].map(code=>({code,data:readFileSync(join(dirname(require.resolve('@tesseract.js-data/'+code)),'4.0.0',code+'.traineddata.gz'))}));
      ocr=await createWorker(langs,1,{cacheMethod:'none',gzip:true,logger:()=>{}});
      for(const image of images) {
        const result=await ocr.recognize(image.data);stats.ocrImages++;
        if(result.data.text?.trim())segments.push({url:image.url,text:result.data.text.slice(0,20000),kind:'ocr',locator:image.locator});
      }
    }
    return {segments:segments.slice(0,20),stats,blocked:false};
  }finally{await ocr?.terminate();await browser?.close();process.removeListener('SIGTERM',stop);}
}
