import type { NoticeData, NoticeFacts } from '@shared/contracts/notices';
import type { IStorage } from '../../lib/storage-contract';
import { admissionYearLabel, graduationClassLabel } from './member-labels';
import { normalizeMemberName } from './event-member-policy';

type Person = { name:string; admission:string|null; graduation:string|null; memberType:string; title?:string|null };
const clean = (value:string|null|undefined) => value?.trim() || '';
const compact = (value:string) => value.replace(/\s/g,'');
function personText(person:Person):string {
  return [person.admission?`${person.admission}학번`:'',person.graduation?`졸업${person.graduation}기`:'',person.name,`${person.memberType}${person.title?`(${person.title})`:''}`].filter(Boolean).join(' ');
}
function providedTitle(title:string|null|undefined,input:string):string|undefined {
  const value=clean(title);return value&&compact(input).includes(compact(value))?value:undefined;
}

async function childPerson(f:NoticeFacts,input:string,storage:IStorage,questions:string[]):Promise<Person|undefined> {
  if(!f.childAlumniInfo&&!f.childAdmissionYear&&!f.childGraduationClass&&!f.childMemberType)return;
  const info=clean(f.childAlumniInfo);
  const years=Array.from(new Set(Array.from(info.matchAll(/(?<!\d)(\d{2}|\d{4})\s*학번/g)).map(m=>m[1].slice(-2))));
  const classes=Array.from(new Set(Array.from(info.matchAll(/(?:졸업\s*)?(\d{1,3})\s*기/g)).map(m=>String(Number(m[1])))));
  const year=clean(f.childAdmissionYear).replace(/학번$/,'').trim() || (years.length===1?years[0]:'');
  const generation=clean(f.childGraduationClass).replace(/^졸업\s*/,'').replace(/\s*기$/,'') || (classes.length===1?classes[0]:'');
  if(!f.childName)questions.push('동문인 자녀의 성함을 알려주세요.');
  if(!year&&!generation)questions.push('동문인 자녀의 학번 또는 졸업기수를 알려주세요.');
  if(!f.childName||(!year&&!generation))return;
  if(year&&!/^(?:\d{2}|\d{4})$/.test(year)||generation&&!/^\d{1,3}$/.test(generation)||years.length>1||classes.length>1) {
    questions.push('자녀 동문 한 명의 학번 또는 졸업기수를 확인해 주세요.');return;
  }
  const candidates=await storage.findAlumniByNameOrAlias(f.childName);
  const matches=candidates.filter(a=>(!year||admissionYearLabel(a.admissionDate)===`${year.slice(-2)}학번`)&&(!generation||graduationClassLabel(a.generation)===`${Number(generation)}기`));
  if(matches.length!==1) {
    console.warn('Celebration child identity unresolved',{expectedMatches:1,actualMatches:matches.length,candidateCount:candidates.length,hasYear:Boolean(year),hasGeneration:Boolean(generation),privateValuesOmitted:true});
    questions.push('명부에서 자녀 동문 한 명을 확인할 수 있도록 성함과 학번 또는 졸업기수를 확인해 주세요.');return;
  }
  const alumni=matches[0];const user=alumni.matchedUserId?await storage.getUser(alumni.matchedUserId):undefined;
  const membership=user?await storage.getMembershipStatus(user.id):undefined;
  return {name:alumni.name,admission:admissionYearLabel(alumni.admissionDate)?.replace(/학번$/,'')||null,graduation:graduationClassLabel(alumni.generation)?.replace(/기$/,'')||null,memberType:user?(membership?.tier==='권리회원'?'권리회원':'회원'):'동문',title:providedTitle(f.childTitle,input)};
}

/** Only explicit input or an owner-scoped request permits contact/account publication. Later corrections win. */
function requested(kind:'계좌'|'연락처',input:string,names:string[],role:string,value=''):boolean {
  let allowed=false;
  const kindPattern=kind==='계좌'?/계좌|마음\s*전하실|축의금/:/연락처|전화|휴대폰|핸드폰/;
  const digits=value.replace(/\D/g,'');
  const suppliedNumber=digits.length>=7?new RegExp(`(?<!\\d)${digits.split('').join('[ ()-]*')}(?!\\d)`):undefined;
  for(const line of input.replace(/https?:\/\/\S+/g,'').split(/[\n;!?]+/)) {
    const direct=Boolean(value&&(line.includes(value)||suppliedNumber?.test(line)));
    const scoped=names.some(name=>name&&compact(line).includes(compact(name)))||Boolean(role&&line.includes(role));
    const negative=/제외|삭제|생략|빼|넣지|게시하지|공개하지|싣지/.test(line);
    const globalRemoval=negative&&kindPattern.test(line)&&!/혼주|신랑|신부|자녀|가족|부모|다른/.test(line);
    if(direct||globalRemoval||kindPattern.test(line)&&scoped&&/포함|게시|추가|넣|알려|표시|기재|공개/.test(line))allowed=!negative;
  }
  return allowed;
}
function inputAccountNumber(number:string,input:string):string {
  const digits=number.replace(/\D/g,'');
  return Array.from(input.matchAll(/\d[\d -]{5,}\d/g)).map(m=>m[0].trim()).find(n=>n.replace(/\D/g,'')===digits)||number;
}
function partyRole(f:NoticeFacts,name:string,alias?:string|null):string|undefined {
  const names=[name,alias].filter(Boolean).map(normalizeMemberName);
  const groom=names.includes(normalizeMemberName(f.groomName)),bride=names.includes(normalizeMemberName(f.brideName));
  if(groom!==bride)return groom?'신랑':'신부';
  return ['신랑','신부'].includes(clean(f.weddingPartyRole))?clean(f.weddingPartyRole):undefined;
}
function optionalLines(f:NoticeFacts):string[] {
  const entries=[['식사',f.meal],['주차',f.parking],['화환',f.flowerPolicy]];
  const lines=entries.map(([label,v])=>[label,clean(v).replace(new RegExp(`^${label}\\s*[:：]\\s*`),'').trim()]).filter(([,v])=>v).map(([label,v])=>`${label}: ${v}`);
  for(const note of f.notes) {
    const value=note.trim().replace(/^[-•]\s*/,'');if(!value||/^[^:：]+[:：]\s*$/.test(value))continue;
    const category=/^(식사|주차|화환)\s*[:：]/.exec(value)?.[1];
    if(category&&lines.some(line=>line.startsWith(category+':')))continue;
    lines.push(/^[^:：\n]{1,12}[:：]/.test(value)?value:`안내: ${value}`);
  }
  // Contact/account sections have their own publication policy; notes cannot bypass it.
  return Array.from(new Set(lines)).filter(line=>{
    const withoutDates=line.replace(/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/g,'');
    return !(/계좌|예금주|연락처|휴대폰|핸드폰|전화|\btel\b/i.test(line)||/\d[\d ()-]{7,}\d/.test(withoutDates));
  }).map(line=>`- ${line}`);
}

export async function renderCelebration(data:NoticeData,input:string,storage:IStorage,parent:Person,dateText:string,questions:string[]) {
  const f=data.facts!;const wedding=data.eventType==='wedding';
  const ask=(condition:unknown,message:string)=>{if(!condition)questions.push(message);};
  parent={...parent,title:providedTitle(f.memberTitle,input)};
  if(wedding) {
    ask(f.time,'예식 시각을 알려주세요.');
    ask(['본인','아들','딸'].includes(clean(f.weddingRelation)),'본인 결혼인지 아들·딸의 결혼인지 알려주세요.');
    ask(f.weddingRelation==='본인'||f.childName,'결혼하는 자녀의 성함을 알려주세요.');
  } else ask(f.clinicName,'개원하는 한의원 이름을 알려주세요.');
  const child=wedding&&f.weddingRelation!=='본인'?await childPerson(f,input,storage,questions):undefined;
  const subjectName=f.weddingRelation==='본인'?parent.name:child?.name||clean(f.childName);
  const side=wedding?partyRole(f,subjectName,f.weddingRelation==='본인'?f.memberName:f.childName):undefined;
  const owners=[{role:'member',person:parent,label:wedding?(f.weddingRelation==='본인'?side:'혼주'):'',names:[parent.name,clean(f.memberName),...(!wedding?[clean(f.clinicName)]:[])]},...(child?[{role:'alumni-child',person:child,label:side,names:[child.name,clean(f.childName)]}]:[])];
  const accountLines:string[]=[];
  for(const owner of owners) {
    const accounts=f.accounts.filter(a=>a.role===owner.role).map(a=>({...a,number:inputAccountNumber(a.number,input)})).filter(a=>requested('계좌',input,owner.names,owner.label||(!wedding?'한의원':''),a.number));
    ask(accounts.length<=1,'게시할 대상별 계좌 한 개씩만 지정해 주세요.');
    if(!accounts.length&&requested('계좌',input,owner.names,owner.label||(!wedding?'한의원':'')))questions.push(`${owner.label||owner.person.name}의 게시할 계좌를 은행·번호·예금주와 함께 알려주세요.`);
    for(const a of accounts) {
      ask(a.bank&&a.number&&a.holder&&/^[\d -]+$/.test(a.number),'게시할 계좌의 은행·번호·예금주를 확인해 주세요.');
      ask(owner.names.some(name=>name&&normalizeMemberName(a.holder).includes(normalizeMemberName(name))),'게시할 계좌가 대상 동문 또는 해당 한의원의 것인지 확인해 주세요.');
      if(wedding)ask(owner.label,'계좌를 게시할 결혼 당사자가 신랑인지 신부인지 알려주세요.');
      accountLines.push([owner.label,wedding?owner.person.name:a.holder,a.bank,a.number].filter(Boolean).join(' '));
    }
  }
  // A non-alumni child's account never becomes a member account by an LLM label.
  if(!child&&f.accounts.some(a=>a.role==='alumni-child'&&requested('계좌',input,[clean(f.childName)],side||'',a.number)))questions.push('자녀 계좌는 자녀의 동문 신원이 확인된 경우에 게시할 수 있습니다.');
  const contactWanted=requested('연락처',input,[clean(f.contactName),parent.name,...(!wedding?[clean(f.clinicName)]:[])],wedding?(f.weddingRelation==='본인'?side||'본인':'혼주'):'한의원',clean(f.contactPhone));
  if(contactWanted)ask(f.contactPhone&&/^\+?[\d ()-]{8,25}$/.test(f.contactPhone),'게시할 연락처를 확인해 주세요.');
  if(questions.length)return {title:'',content:'',questions:Array.from(new Set(questions))};
  const event=wedding?(f.weddingRelation==='본인'?'결혼':`${f.weddingRelation} ${subjectName} 님의 결혼`):`${f.clinicName} 개원`;
  const heading=child?`본회 ${personText(parent)}의 ${f.weddingRelation}\n본회 ${personText(child)}의 결혼을 알려드립니다.`:`본회 ${personText(parent)}의 ${event}을 알려드립니다.`;
  const place=[f.place,f.room,f.floor].filter(Boolean).join(' ');
  const details=[`- ${wedding||f.time?'일시':'개원일'}: ${dateText}`,`- 장소: ${place}`];
  if(f.address&&!compact(place).includes(compact(f.address)))details.push(`- 주소: ${f.address}`);
  details.push(...optionalLines(f));
  if(contactWanted&&f.contactPhone) {
    const phone=/^010\d{8}$/.test(f.contactPhone)?f.contactPhone.replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3'):f.contactPhone;
    details.push(`- 연락처: ${[f.contactName,phone].filter(Boolean).join(' ')}`);
  }
  const blocks=['#알림 #경사',heading,details.join('\n')];
  const url=data.sources.find(source=>source.status!=='blocked')?.url;
  if(url)blocks.push(`■ ${wedding?'모바일 청첩장':'개원 안내'}\n${url}`);
  if(accountLines.length)blocks.push('■ 마음 전하실 곳\n'+accountLines.join('\n'));
  blocks.push(wedding?'많은 축하와 참석 부탁드립니다.':'개원을 축하하며 많은 관심과 응원 부탁드립니다.','-동국대학교 한의과대학 동문회-');
  return {title:`[${wedding?'결혼':'개원'}] ${parent.name} ${event}`,content:blocks.join('\n\n'),questions:[]};
}
