import { SITE_NAME } from "./site";

// Public association details only. Credentials and member records do not belong here.
export const ASSOCIATION_CONTACT = {
  representative: "최윤용",
  registrationNumber: "504-82-90335",
  address: "07944 서울특별시 양천구 오목로 181, 1층 큰나무한의원 (신정동)",
  email: "alumni.dkom@gmail.com",
  bandUrl: "https://band.us/@dkom",
  inquiryUrl: "https://buly.kr/AF2yVzW",
  inquiryPerson: "수석부회장 박종웅",
} as const;

export const ASSOCIATION_BANK_ACCOUNT = {
  bank: "기업은행",
  shortBank: "기업",
  number: "085-110653-04-017",
  holder: SITE_NAME,
} as const;

export const ASSOCIATION_ACCOUNT_LABEL = `${ASSOCIATION_BANK_ACCOUNT.shortBank} ${ASSOCIATION_BANK_ACCOUNT.number} ${ASSOCIATION_BANK_ACCOUNT.holder}`;
