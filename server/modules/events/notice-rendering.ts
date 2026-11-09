import { runNoticeWriter } from "../../integrations/notice-writer";
import type { NoticeData } from "@shared/contracts/notices";
import type { IStorage } from "../../lib/storage-contract";
import { normalizeMemberName, resolveEventMember } from "./event-member-policy";
import { admissionYearLabel, graduationClassLabel } from "./member-labels";
import { NoticeGenerationError } from "./notice-extraction";
import { renderCelebration } from "./celebration-rendering";

function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function dateLabel(date: string, time: string | null): string {
  const day = new Date(`${date}T00:00:00Z`);
  const label = `${day.getUTCFullYear()}년 ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일(${"일월화수목금토"[day.getUTCDay()]}요일)`;
  return time ? `${label} ${time}` : label;
}
async function renderPython(data: unknown, options: Record<string, string | null>): Promise<string> {
  try {
    const result = await runNoticeWriter<{ content: string }>({ data, options });
    if (typeof result.content !== "string") throw new Error();
    return result.content;
  } catch { throw new NoticeGenerationError("부고 정보의 날짜·연락처·회원 표기를 다시 확인해 주세요."); }
}

export async function renderNotice(data: NoticeData, sourceText: string, requesterId: number, storage: IStorage): Promise<{ title: string; content: string; questions: string[] }> {
  const f = data.facts;
  if (!f) return { title: "", content: "", questions: ["경조사 내용을 입력해 주세요."] };
  const questions = [...f.questions];
  const ask = (condition: unknown, question: string) => { if (!condition) questions.push(question); };
  const requester = await storage.getUser(requesterId);
  const memberName = f.memberName || requester?.name;
  // Only user-provided target identity is accepted for proxy registration.
  if (f.memberName && normalizeMemberName(f.memberName) !== normalizeMemberName(requester?.name)) {
    ask(sourceText.replace(/\s/g, "").includes(normalizeMemberName(f.memberName)), "대리 등록할 동문 이름과 학번을 입력해 주세요.");
  }
  const claimedYear = f.admissionYear?.replace(/학번$/, "").trim();
  const validYear = claimedYear && /^(?:\d{2}|\d{4})$/.test(claimedYear) ? claimedYear : undefined;
  ask(!claimedYear || validYear, "대상 동문의 학번을 확인해 주세요.");
  const member = await resolveEventMember({ relatedMemberName: memberName, sourceText: validYear ? `${validYear}학번` : sourceText }, requesterId, storage);
  if (member.kind === "blocked") questions.push(member.message);
  if (requester?.isAdmin && member.kind === "ready" && member.user?.id !== requesterId) {
    const year = validYear;
    ask(year && new RegExp(`(?<!\\d)${year}\\s*학번`).test(sourceText), "대상 동문의 이름과 학번을 원문에 함께 적어 주세요.");
  }
  if (member.kind === "blocked") return { title: "", content: "", questions: Array.from(new Set(questions)) };
  const graduation = graduationClassLabel(member.alumni?.generation)?.replace(/기$/, "") ?? null;
  const admission = admissionYearLabel(member.alumni?.admissionDate)?.replace(/학번$/, "") ?? null;
  ask(graduation || admission, "명부의 학번 또는 졸업기수를 확인해 주세요.");
  const membership = member.user ? await storage.getMembershipStatus(member.user.id) : undefined;
  const memberType = member.user ? membership?.tier === "권리회원" ? "권리회원" : "회원" : "동문";
  ask(validDate(f.date), data.eventType === "obituary" ? "발인 날짜를 연·월·일까지 알려주세요." : data.eventType === "wedding" ? "예식 날짜를 연·월·일까지 알려주세요." : "개원 날짜를 연·월·일까지 알려주세요.");
  ask(!f.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(f.time), "시각을 오전·오후와 함께 알려주세요.");
  ask(f.place, data.eventType === "obituary" ? "빈소를 알려주세요." : "장소를 알려주세요.");
  if(data.eventType !== 'obituary') return renderCelebration(data,sourceText,storage,{
    name:member.memberDisplayName,admission,graduation,memberType,
  },validDate(f.date)?dateLabel(f.date!,f.time):'',questions);
  const phone = data.eventType === "obituary" && f.relation === "본인" ? f.contactPhone : member.user?.phoneNumber || member.alumni?.mobile || f.contactPhone;
  if (data.eventType === "obituary") {
    ask(f.relation && ["본인", "부친", "모친", "빙부", "빙모", "시부", "시모", "자녀"].includes(f.relation), "동문과 고인의 관계를 알려주세요.");
    ask(f.deceasedName, "고인 성함을 알려주세요.");
    ask(f.deceasedAge && /^\d{1,3}$/.test(f.deceasedAge) && Number(f.deceasedAge) > 0 && Number(f.deceasedAge) <= 130, "고인의 향년을 알려주세요.");
    ask(!f.deathDate || validDate(f.deathDate), "별세일을 연·월·일까지 알려주세요.");
    ask(phone && /^\+?[\d ()-]{8,25}$/.test(phone), "안내할 연락처를 알려주세요.");
    if (f.relation === "본인") {
      ask(normalizeMemberName(f.deceasedName) === normalizeMemberName(member.memberDisplayName) || normalizeMemberName(f.deceasedName) === normalizeMemberName(f.memberName), "본인상 고인 성함과 대상 동문이 일치하는지 확인해 주세요.");
      ask(f.contactName && normalizeMemberName(f.contactName) !== normalizeMemberName(member.memberDisplayName), "연락 가능한 유가족의 성함·관계를 알려주세요.");
      ask(phone && phone.replace(/\D/g, "") !== (member.user?.phoneNumber || member.alumni?.mobile || "").replace(/\D/g, ""), "고인 연락처 대신 유가족 연락처를 알려주세요.");
    }
  }
  if (data.eventType === "obituary") ask(f.accounts.length <= 1, "부고에 게시할 대표 계좌 한 개를 지정해 주세요.");
  for (const account of f.accounts) {
    ask(account.bank && account.number && account.holder && /^[\d -]+$/.test(account.number), "게시할 계좌의 은행·번호·예금주를 확인해 주세요.");
    ask(account.role === "member", "계좌는 대상 동문의 것만 게시할 수 있습니다.");
    // LLM cannot import all accounts from a linked family notice by itself.
    ask(data.eventType === "obituary" && data.sources.some((source) => source.status === "fetched") || sourceText.includes(account.number) || /계좌.*(?:포함|게시|알려|추가)|(?:마음|축의|부의).*계좌/.test(sourceText), "게시할 계좌를 원문에 적거나 포함할 계좌를 지정해 주세요.");
  }
  if (questions.length) return { title: "", content: "", questions: Array.from(new Set(questions)) };
  const name = member.memberDisplayName;
  if (data.eventType === "obituary") {
    const account = f.accounts[0];
    const content = await renderPython({
      source: { url: data.sources.find((source) => source.status !== "blocked")?.url },
      member: { name, reverseType: f.relation }, deceased: { name: f.deceasedName, age: f.deceasedAge, deathDate: f.deathDate },
      funeral: { funeralHome: f.place, room: f.room, floor: f.floor, coffinOutDate: f.date, coffinOutTime: f.time, cemetery: f.cemetery, visitationDeclined: f.visitationDeclined },
      contact: { contactName: f.relation === "본인" ? f.contactName : name, phoneNumberDisplay: phone, bank: account?.bank, accountNumber: account?.number, accountHolder: account?.holder },
    }, { member_name: name, member_type: memberType, graduation_class: graduation, admission_year: admission, title: f.memberTitle, relation: f.relation, phone: phone || null, contact_name: f.relation === "본인" ? f.contactName : name });
    return { title: `[부고] ${name} ${f.relation}상`, content, questions: [] };
  }
  throw new NoticeGenerationError("지원하지 않는 경조사 유형입니다.");
}
