import { z } from "zod";

export * from "./community-events";
export * from "./alumni-sync";

export const PENDING_REGISTRATION_CONFLICT_REASONS = [
  "email_conflict",
  "phone_conflict",
  "alumni_claimed",
  "alumni_race",
  "not_found",
] as const;

export type PendingRegistrationConflictReason =
  typeof PENDING_REGISTRATION_CONFLICT_REASONS[number];

export type PendingRegistrationUserData = {
  kakaoId: string;
  email: string;
  name: string;
  phoneNumber: string;
  profileImage: string | null;
  birthday: string | null;
  birthdayType: "SOLAR" | "LUNAR" | null;
  isLeapMonth: boolean | null;
  conflictReason: PendingRegistrationConflictReason;
};

// Explicit wire contracts: JSON timestamps are strings, never persistence Dates.
export type ClientUser = {
  id: number;
  email: string;
  name: string;
  graduationYear: number | null;
  isVerified: boolean | null;
  isAdmin: boolean | null;
  profileImage: string | null;
  phoneNumber: string | null;
  birthday: string | null;
  birthdayType: string | null;
  isLeapMonth: boolean | null;
  activityRegion: string | null;
  createdAt: string | null;
};

export type Category = {
  id: number;
  name: string;
  displayName: string;
  color: string | null;
  badgeVariant: string | null;
  isActive: boolean | null;
  sortOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Post = {
  id: number;
  title: string;
  content: string;
  categoryId: number | null;
  authorId: number | null;
  isPublished: boolean | null;
  imageUrls: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Comment = {
  id: number;
  postId: number;
  authorId: number | null;
  content: string;
  createdAt: string | null;
};

export type Obituary = {
  id: number;
  title: string;
  deceasedName: string;
  deceasedRelation: string;
  dateOfDeath: string;
  funeralHome: string | null;
  jangji: string | null;
  bankAccount: string | null;
  chiefMourner: string | null;
  contactNumber: string | null;
  authorId: number | null;
  createdAt: string | null;
};

export type AdminPendingRegistrationDto = {
  id: number;
  name: string;
  email: string;
  status: string | null;
  createdAt: string | null;
};
export type AdminPendingRegistrationUpdateResult =
  | AdminPendingRegistrationDto
  | { deleted: true; id: number };

// Match the existing persistence insert validator without importing Drizzle.
const pgIntegerSchema = z.number().min(-2147483648).max(2147483647).int();
export const insertPostSchema = z.object({
  title: z.string(),
  content: z.string(),
  categoryId: pgIntegerSchema.nullable().optional(),
  authorId: pgIntegerSchema.nullable().optional(),
  isPublished: z.boolean().nullable().optional(),
  // The existing generator coerces text[] elements to strings at runtime.
  // Preserve that behavior (including non-string elements) here;
  // tightening attachment validation is a separate API contract change.
  imageUrls: z.array(z.coerce.string()).nullable().optional(),
});
export type InsertPost = z.infer<typeof insertPostSchema>;

export const insertCommentSchema = z.object({
  content: z
    .string()
    .min(1, "댓글 내용을 입력해주세요")
    .max(1000, "댓글은 1000자 이내로 입력해주세요"),
});
export type InsertComment = z.infer<typeof insertCommentSchema>;

export const insertObituarySchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  deceasedName: z.string().min(1, "고인의 성함을 입력해주세요"),
  deceasedRelation: z.string().min(1),
  dateOfDeath: z.string().min(1, "별세일을 입력해주세요"),
  funeralHome: z.string().optional().default(""),
  jangji: z.string().optional().default(""),
  bankAccount: z.string().optional().default(""),
  chiefMourner: z.string().optional().default(""),
  contactNumber: z.string().optional().default(""),
});
export type InsertObituary = z.infer<typeof insertObituarySchema>;

// 활동 지역(시/도) 18개 — 온보딩·프로필 편집·서버 검증에서 공통 사용.
export const REGION_OPTIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도',
  '제주특별자치도', '해외',
] as const;
export const activityRegionSchema = z.enum(REGION_OPTIONS);

// 연회비 기준액(원). 권리회원 판정 안내 및 미납 표시에 사용.
export const ANNUAL_DUES = 50000;
export type MembershipTier = '권리회원' | '일반회원';
export type MembershipStatus = {
  year: number;
  tier: MembershipTier;
  isPaid: boolean;
  paidAmount: number;
  annualDues: number;
  currentYearPayment: { createdAt: string | null } | null;
};

// 프로필에서 본인이 수정 가능한 항목만 허용 (이름·졸업년도 등 검증 항목 제외).
export const updateProfileSchema = z.object({
  activityRegion: activityRegionSchema.nullable().optional(),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
