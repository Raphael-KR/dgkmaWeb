import type {
  User, InsertUser, AlumniRecord, PendingRegistration, InsertPendingRegistration,
  PendingRegistrationUserData,
} from "@shared/schema";
import type { AlumniSyncReport } from "@shared/alumni-sync";

// 동문 명부 노출 허용 필드 (개인정보 최소화 — 연락처·주소·메모 제외)
export type DirectoryAlumni = {
  id: number;
  name: string;
  generation: string;
  department: string;
  graduationYear: number | null;
  position: string | null;
  isMatched: boolean;
};

export type DirectoryResult = {
  alumni: DirectoryAlumni[];
  total: number; // 열람 범위 내 전체 동문 수 (검색어 q 미적용 — 통계용)
  hasScope: boolean; // 열람 범위(기수/지부)를 산출할 수 있는지 여부
  scope: { generation: string | null; region: string | null };
};

export type PendingRegistrationReviewInput = Omit<InsertPendingRegistration, "userData"> & {
  userData: PendingRegistrationUserData;
};

export type CreateOrRefreshPendingRegistrationResult =
  | { kind: "pending"; registration: PendingRegistration }
  | { kind: "registered"; user: User };

export interface RegistryStorageContract {
  // This registration path owns the indivisible user-insert/alumni-claim transaction.
  createUserWithAlumniClaim(
    user: InsertUser,
    name: string,
    phoneNumber: string,
    oauthStartedAt?: Date,
  ): Promise<User | undefined>;
  getAlumniRecordByUserId(userId: number): Promise<AlumniRecord | undefined>;
  findAlumniByName(name: string): Promise<AlumniRecord[]>;
  findAlumniByNameOrAlias(name: string): Promise<AlumniRecord[]>;
  claimAlumniRecord(name: string, phoneNumber: string, userId: number): Promise<AlumniRecord | undefined>;
  findAlumniByNameAndYear(name: string, year: number): Promise<AlumniRecord | undefined>;
  updateAlumniMatch(id: number, userId: number): Promise<AlumniRecord | undefined>;
  previewAlumniSync(): Promise<AlumniSyncReport>;
  applyAlumniSync(fingerprint: string): Promise<AlumniSyncReport>;
  getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult>;
  getPendingRegistrations(): Promise<PendingRegistration[]>;
  createOrRefreshPendingRegistration(
    registration: PendingRegistrationReviewInput,
    oauthStartedAt: Date,
  ): Promise<CreateOrRefreshPendingRegistrationResult>;
  rejectPendingRegistration(
    id: number,
    beforeDelete: (registration: PendingRegistration) => Promise<void>,
  ): Promise<{ id: number } | undefined>;
  updatePendingRegistrationStatus(id: number, status: string): Promise<PendingRegistration | undefined>;
}
