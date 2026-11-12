import type {
  User,
  InsertUser,
  AlumniRecord,
  PendingRegistration,
  InsertPendingRegistration,
  PendingRegistrationUserData,
} from "@shared/schema";
import type { AdminRegistrationListItem, RegistrationApprovalStatus } from "@shared/contracts";
import type { AlumniSyncReport } from "@shared/alumni-sync";
import type { DirectoryResult } from "@shared/contracts/directory";

export type PendingRegistrationReviewInput = Omit<InsertPendingRegistration, "userData"> & {
  userData: PendingRegistrationUserData;
};

export type CreateOrRefreshPendingRegistrationResult =
  { kind: "pending"; registration: PendingRegistration } | { kind: "registered"; user: User };

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
  previewAlumniSync(): Promise<AlumniSyncReport>;
  applyAlumniSync(fingerprint: string): Promise<AlumniSyncReport>;
  getDirectoryAlumni(viewer: User, q?: string): Promise<DirectoryResult>;
  getPendingRegistrations(status?: "pending" | "rejected"): Promise<PendingRegistration[]>;
  getPendingRegistrationReviews(
    status?: RegistrationApprovalStatus,
  ): Promise<AdminRegistrationListItem[]>;
  createOrRefreshPendingRegistration(
    registration: PendingRegistrationReviewInput,
    oauthStartedAt: Date,
  ): Promise<CreateOrRefreshPendingRegistrationResult>;
  rejectPendingRegistration(id: number): Promise<PendingRegistration | undefined>;
  deleteRejectedRegistration(
    id: number,
    beforeDelete: (registration: PendingRegistration) => Promise<void>,
  ): Promise<{ id: number } | undefined>;
  reopenPendingRegistration(id: number): Promise<PendingRegistration | undefined>;
  cancelMemberApproval(userId: number, actorId: number): Promise<PendingRegistration | undefined>;
  approvePendingRegistration(id: number): Promise<PendingRegistration | undefined>;
}
