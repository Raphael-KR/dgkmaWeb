import { MAX_EXTRACTED_TEXT_LENGTH } from "./extraction-limits";
import type { FieldEvidence, CollectionRule } from "./collection-contract";
import type { NoticeType } from "@shared/contracts/notices";

const aliases: Record<string, RegExp> = {
  deceasedName:
    /(?:deceased|dead|death|고인).*(?:name|성명|이름)$|^(?:deceasedName|deadName|고인명)$/i,
  deceasedAge: /(?:deceased|dead|고인).*(?:age|나이|향년)$|^(?:age|향년)$/i,
  deathDate: /(?:death|dead|별세|사망).*(?:date|day|일자|일시)$|^(?:deathDate|별세일)$/i,
  date: /(?:coffinout|departure|funeralout|outgoing|balin|발인|wedding|opening).*(?:date|day|일자|일시)$|^(?:발인일|발인일시|startDate)$/i,
  time: /(?:coffinout|departure|funeralout|outgoing|balin|발인|wedding|opening).*(?:time|시간|시각)$/i,
  timeDefined:
    /(?:coffinout|departure|funeralout|발인|wedding|opening).*(?:timeDefined|timeKnown)$/i,
  place:
    /(?:funeralhome|funeralhall|mortuary|장례식장|빈소|venue).*(?:name|이름|명)$|^(?:funeralHome|funeralHall|장례식장|venue)$/i,
  room: /(?:room|빈소|호실).*(?:name|number|no|명|번호)$|^(?:room|roomName|빈소|호실)$/i,
  floor: /^(?:floor|층)$/i,
  cemetery: /(?:cemetery|burial|장지)(?:name|place|명)?$/i,
  crematorium: /(?:cremator|crematorium|화장장).*(?:name|명)$|^(?:crematorium|화장장)$/i,
  contactPhone:
    /(?:contact|chiefmourner|chief|representative|상주|연락처).*(?:phone|mobile|tel|전화|번호)$|^(?:contactPhone|연락처)$/i,
  contactName:
    /(?:contact|chiefmourner|representative|대표상주).*(?:name|성명|이름)$|^(?:contactName|상주명)$/i,
  clinicName: /(?:clinic|한의원).*(?:name|명)$/i,
  partnerName: /^(?:brideName|groomName|partnerName)$/i,
  accountBank: /(?:account|계좌).*(?:bank|은행)$|^bankName$/i,
  accountNumber: /(?:account|계좌).*(?:number|account|no|번호)$|^accountNumber$/i,
  accountHolder: /(?:account|계좌).*(?:holder|owner|name|예금주)$/i,
  mournerName: /(?:mourner|상주).*(?:name|이름)$/i,
  mournerRelation: /(?:mourner|member|상주).*(?:relationType|relation|관계)$/i,
  relation: /(?:member|상주).*(?:reverseType)$/i,
  visitationDeclined: /^(?:visitationDeclined|condolencesDeclined|조문사양)$/i,
  notes: /^(?:mournerText|noticeMessage|noticeText|안내사항)$/i,
  updatedAt: /^(?:modifiedAt|updatedAt)$/i,
};
function celebrationAliases(type: NoticeType): Record<string, RegExp> {
  const common: Record<string, RegExp> = {
    date: /^(?:startDate|eventDate|예식일|예식일시|개원일|개원일시)$|(?:wedding|ceremony|opening|예식|개원)(?:Info|Details)?(?:Date|Day|DateTime|일자|일시)$/i,
    time: /^(?:startTime|eventTime)$|(?:wedding|ceremony|opening|예식|개원)(?:Info|Details)?(?:Time|시각|시간)$/i,
    timeDefined: /(?:wedding|ceremony|opening)(?:timeDefined|timeKnown)$/i,
    place:
      /^(?:place|venue|venueName|hallName|locationName|장소|예식장)$|(?:location|venue|hall|clinicAddress)(?:name|place|명)$/i,
    address:
      /^(?:address|roadAddress|streetAddress|venueAddress|weddingAddress|clinicAddress|주소)$/i,
    room: /^(?:room|roomName|hallRoom|층호실)$/i,
    floor: /^(?:floor|층)$/i,
    contactName: /^(?:contactName|contactPerson|연락처명의)$/i,
    contactPhone: /^(?:contactPhone|contactTel|clinicPhone|연락처)$/i,
    accountBank: aliases.accountBank,
    accountNumber: aliases.accountNumber,
    accountHolder: aliases.accountHolder,
    meal: /^(?:meal|mealInfo|dining|diningInfo|banquet|banquetInfo|식사|식사안내)$/i,
    parking: /^(?:parking|parkingInfo|parkingGuide|주차|주차안내)$/i,
    flowerPolicy: /^(?:flowerPolicy|flowerNotice|flowerInfo|wreathPolicy|화환|화환안내|화환사양)$/i,
    notes: /^(?:noticeMessage|noticeText|guide|guidance|안내사항|기타안내)$/i,
    updatedAt: aliases.updatedAt,
  };
  return type === "wedding"
    ? {
        ...common,
        groomFather: /^(?:groomFather(?:Name)?|신랑아버지)$/i,
        groomMother: /^(?:groomMother(?:Name)?|신랑어머니)$/i,
        brideFather: /^(?:brideFather(?:Name)?|신부아버지)$/i,
        brideMother: /^(?:brideMother(?:Name)?|신부어머니)$/i,
        groomName: /^(?:groom(?:Info)?(?:Full)?Name|신랑|신랑이름|신랑성명)$/i,
        brideName: /^(?:bride(?:Info)?(?:Full)?Name|신부|신부이름|신부성명)$/i,
        weddingRelation: /^(?:weddingRelation|childRelation|혼인관계)$/i,
        eventName: /^(?:eventName|weddingTitle)$/i,
      }
    : {
        ...common,
        clinicName:
          /^(?:clinicName|hospitalName|한의원명)$|(?:clinic|hospital|한의원)(?:name|명)$/i,
        eventName: /^(?:eventName|openingTitle)$/i,
      };
}
const labels: Record<string, string> = {
  deceasedName: "고인",
  deceasedAge: "향년",
  deathDate: "별세일",
  date: "발인/행사일",
  time: "시각",
  timeDefined: "발인/행사 시각 확정 여부",
  place: "장례식장/장소",
  room: "빈소/호실",
  floor: "층",
  cemetery: "장지",
  crematorium: "화장장",
  contactName: "유가족 연락처 명의",
  contactPhone: "유가족 연락처",
  clinicName: "한의원",
  partnerName: "결혼 당사자",
  accountBank: "계좌 은행",
  accountNumber: "계좌번호",
  accountHolder: "예금주",
  mournerName: "상주",
  mournerRelation: "상주 관계",
  relation: "대상 관계",
  visitationDeclined: "조문 사양",
  notes: "안내",
  updatedAt: "해당 객체 수정 시각",
};
export function atPath(value: unknown, path: (string | number)[]): unknown {
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export function jsonFields(
  value: unknown,
  url: string,
  kind: "html" | "api" = "api",
  noticeType: NoticeType = "obituary",
): { evidence: FieldEvidence[]; fields: CollectionRule["fields"]; shape: CollectionRule["shape"] } {
  const evidence: FieldEvidence[] = [];
  const fields: CollectionRule["fields"] = [];
  const shape: CollectionRule["shape"] = [];
  let visited = 0;
  const collectedAt = new Date().toISOString();
  function visit(node: unknown, path: (string | number)[]) {
    if (++visited > 4000 || path.length > 10 || evidence.length >= 60 || node === null) return;
    if (Array.isArray(node)) {
      if (node.length <= 20) node.forEach((v, i) => visit(v, [...path, i]));
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (!/^[A-Za-z_$가-힣][A-Za-z0-9_$가-힣-]{0,79}$/.test(key)) continue;
      const p = [...path, key];
      if (child && typeof child === "object") {
        visit(child, p);
        continue;
      }
      if (
        !["string", "number", "boolean"].includes(typeof child) ||
        String(child).length > 500 ||
        !String(child).trim() ||
        /^(?:null|undefined|미입력|미정|정보 없음|[-–—])$/i.test(String(child).trim())
      )
        continue;
      // Match the nearest container, not arbitrary ancestors (deceased.cemeteries.name is not a deceased name).
      const joined = p
        .filter((x) => typeof x === "string")
        .slice(-2)
        .join("")
        .replace(/[_-]/g, "");
      const candidates = [joined, key.replace(/[_-]/g, "")];
      if (noticeType !== "obituary")
        candidates.unshift(
          p
            .filter((x) => typeof x === "string")
            .slice(-3)
            .join("")
            .replace(/[_-]/g, ""),
        );
      let field = Object.entries(
        noticeType === "obituary" ? aliases : celebrationAliases(noticeType),
      ).find(([, pattern]) => candidates.some((v) => pattern.test(v)))?.[0];
      if (noticeType === "obituary") {
        if (/^cemeteries(?:name|place)$/i.test(joined)) field = "cemetery";
        if (/^member(?:fullName|name)$/i.test(joined)) field = "contactName";
        if (/^member(?:phoneNumber|phone|mobile)$/i.test(joined)) field = "contactPhone";
      } else if (key === "name" && typeof (node as Record<string, unknown>)["@type"] === "string") {
        const schemaType = String((node as Record<string, unknown>)["@type"]);
        if (/Event/i.test(schemaType)) field = "eventName";
        if (
          noticeType === "opening" &&
          /MedicalClinic|MedicalBusiness|LocalBusiness/.test(schemaType)
        )
          field = "clinicName";
      }
      if (field === "updatedAt" && path.length > 1) continue;
      if (!field) continue;
      evidence.push({
        field,
        value: String(child).trim(),
        url,
        locator: JSON.stringify(p),
        kind,
        collectedAt,
      });
      // Personal dynamic keys cannot enter a reusable rule. Only structural ASCII keys are persisted.
      if (
        p.every(
          (x) =>
            typeof x === "number" ||
            (/^[A-Za-z_$][A-Za-z0-9_$-]{0,79}$/.test(x) &&
              !(/^[a-f0-9]{16,64}$/i.test(x) || /[0-9]{7,}/.test(x))),
        )
      ) {
        fields.push({ field: field as CollectionRule["fields"][number]["field"], path: p });
        shape.push({ path: p, type: typeof child as "string" | "number" | "boolean" });
      }
    }
  }
  visit(value, []);
  return { evidence, fields, shape };
}
export function evidenceText(
  evidence: FieldEvidence[],
  noticeType: NoticeType = "obituary",
): string {
  const names: Record<string, string> =
    noticeType === "obituary"
      ? labels
      : {
          ...labels,
          date: noticeType === "wedding" ? "예식일" : "개원일",
          place: "장소",
          room: "홀/호실",
          contactName: "연락처 명의",
          contactPhone: "연락처",
          groomName: "신랑",
          brideName: "신부",
          groomFather: "신랑 아버지",
          groomMother: "신랑 어머니",
          brideFather: "신부 아버지",
          brideMother: "신부 어머니",
          weddingRelation: "혼인 관계",
          eventName: "행사명",
          address: "주소",
          meal: "식사",
          parking: "주차",
          flowerPolicy: "화환 안내",
        };
  return Array.from(
    new Set(evidence.map((e) => `${names[e.field] || e.field} [${e.locator}]: ${e.value}`)),
  )
    .join("\n")
    .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}
export function hasEventIdentity(evidence: FieldEvidence[], noticeType: NoticeType): boolean {
  const identity =
    noticeType === "obituary"
      ? ["deceasedName"]
      : noticeType === "wedding"
        ? ["groomName", "brideName"]
        : ["clinicName"];
  return evidence.some(
    (e) =>
      (identity.includes(e.field) && Boolean(e.value.trim())) ||
      (e.field === "eventName" &&
        (noticeType === "wedding"
          ? /결혼|예식|wedding/i
          : noticeType === "opening"
            ? /개원|opening/i
            : /부고|obituary/i
        ).test(e.value)),
  );
}
export function enoughFields(
  evidence: FieldEvidence[],
  noticeType: NoticeType = "obituary",
): boolean {
  const has = (f: string) => evidence.some((e) => e.field === f && e.value.trim());
  // Ambiguous lists must not become a reusable rule for one notice.
  const identities =
    noticeType === "obituary"
      ? ["deceasedName"]
      : noticeType === "wedding"
        ? ["groomName", "brideName"]
        : ["clinicName"];
  if (
    [...identities, "date", "place"].some(
      (field) => new Set(evidence.filter((e) => e.field === field).map((e) => e.value)).size > 1,
    )
  )
    return false;
  return hasEventIdentity(evidence, noticeType) && has("place") && has("date");
}
export function textFields(
  text: string,
  url: string,
  kind: FieldEvidence["kind"],
  locator = "body",
  noticeType: NoticeType = "obituary",
): FieldEvidence[] {
  const common = {
    place: "장소|주소지",
    address: "주소",
    room: "호실|홀",
    contactPhone: "연락처",
    meal: "식사|식사안내",
    parking: "주차|주차안내",
    flowerPolicy: "화환|화환안내|화환사양",
  };
  const labels: Record<string, string> =
    noticeType === "obituary"
      ? {
          deceasedName: "고인",
          deceasedAge: "향년",
          deathDate: "별세일|사망일",
          date: "발인일시|발인일|발인",
          place: "장례식장|장소",
          room: "빈소|호실",
          cemetery: "장지",
          contactPhone: "연락처",
        }
      : noticeType === "wedding"
        ? {
            ...common,
            date: "결혼일|예식일|예식일시|일시",
            time: "예식시간|예식시각",
            place: "예식장|장소",
            groomName: "신랑",
            brideName: "신부",
            groomFather: "신랑아버지",
            groomMother: "신랑어머니",
            brideFather: "신부아버지",
            brideMother: "신부어머니",
          }
        : {
            ...common,
            date: "개원일|개원일시|일시",
            time: "개원시각|개원시간",
            clinicName: "한의원명|한의원",
          };
  const result: FieldEvidence[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const pattern = new RegExp("(?:^|\\n)\\s*(?:" + label + ")\\s*[:：]\\s*([^\\n]{1,500})", "g");
    for (const m of Array.from(text.matchAll(pattern)))
      result.push({
        field,
        value: m[1].trim(),
        url,
        kind,
        locator: locator + ":" + m.index,
        collectedAt: new Date().toISOString(),
      });
  }
  return result;
}
export function meaningfulText(text: string, noticeType: NoticeType = "obituary"): boolean {
  if (
    text.length < 25 ||
    /captcha|verify you are human|접근이 제한|로그인이 필요|삭제된 부고|종료된 부고/i.test(text)
  )
    return false;
  if (noticeType === "obituary")
    return /(?:故|고인|별세|부고)/.test(text) && /빈소|장례식장/.test(text) && /발인/.test(text);
  const dated = /\d{4}\s*[년./-]\s*\d{1,2}/.test(text);
  return (
    dated &&
    (noticeType === "wedding"
      ? /결혼|예식|신랑|신부|wedding/i.test(text) && /장소|웨딩|예식장|홀|venue/i.test(text)
      : /개원|opening/i.test(text) && /한의원|clinic/i.test(text))
  );
}
