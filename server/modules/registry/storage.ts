import { AlumniRecordStorage } from "./alumni-record-storage";
import { DirectoryStorage } from "./directory-storage";
import { PendingRegistrationStorage } from "./pending-registration-storage";
import { AlumniSyncStorage } from "./alumni-sync-storage";

export type {
  PendingRegistrationReviewInput,
  CreateOrRefreshPendingRegistrationResult,
} from "./storage-contract";
export type { DirectoryAlumni, DirectoryResult } from "@shared/contracts/directory";
export {
  normalizePhoneForComparison,
  PhoneRegistrationConflictError,
  PendingRegistrationConflictError,
} from "../identity/registration-support";
export {
  ALUMNI_SYNC_ADVISORY_LOCK_KEY,
  AlumniSyncFingerprintMismatchError,
  AlumniSyncBlockedError,
  AlumniSyncInProgressError,
} from "./alumni-sync-storage";

export type RegistryStorage = AlumniRecordStorage &
  DirectoryStorage &
  PendingRegistrationStorage &
  AlumniSyncStorage;

// DatabaseStorage와 같은 descriptor 조립으로 교체 가능한 메서드와 단일 this를 보존한다.
// 별도 인스턴스 생성이나 bind는 명부 조회의 교차 메서드 호출을 바꾸므로 사용하지 않는다.
export const RegistryStorage = class RegistryStorage {} as {
  new (): RegistryStorage;
  prototype: RegistryStorage;
};

for (const DomainStorage of [
  AlumniRecordStorage,
  DirectoryStorage,
  PendingRegistrationStorage,
  AlumniSyncStorage,
]) {
  const { constructor: _constructor, ...methods } = Object.getOwnPropertyDescriptors(
    DomainStorage.prototype,
  );
  Object.defineProperties(RegistryStorage.prototype, methods);
}
