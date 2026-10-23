import { IdentityStorage } from "./modules/identity/storage";
import { RegistryStorage } from "./modules/registry/storage";
import { ContentStorage } from "./modules/content/storage";
import { EventsStorage } from "./modules/events/storage";
import { DuesStorage } from "./modules/dues/storage";
import type { IStorage } from "./lib/storage-contract";

export {
  normalizePhoneForComparison,
  PhoneRegistrationConflictError,
  PendingRegistrationConflictError,
  ALUMNI_SYNC_ADVISORY_LOCK_KEY,
  AlumniSyncFingerprintMismatchError,
  AlumniSyncBlockedError,
  AlumniSyncInProgressError,
} from "./modules/registry/storage";
export type {
  DirectoryAlumni,
  DirectoryResult,
  PendingRegistrationReviewInput,
  CreateOrRefreshPendingRegistrationResult,
} from "./modules/registry/storage-contract";
export type { IStorage } from "./lib/storage-contract";
export type { CommentWithAuthor } from "./modules/content/storage-contract";

// Preserve one receiver and the original prototype-method semantics: callers and
// tests can replace methods on this facade without losing cross-method dispatch.
// Delegating through separate domain instances or binding methods would capture
// another receiver, so e.g. getMembershipStatus would bypass an overridden
// getPaymentsByUser. Copying descriptors keeps shared `this`, method identity,
// writability/configurability and non-enumerability, without domain constructors
// or per-instance wrappers. Transactions remain wholly inside their domain method.
export interface DatabaseStorage extends IStorage, RegistryStorage {}
export class DatabaseStorage {}

for (const DomainStorage of [
  IdentityStorage, RegistryStorage, ContentStorage, EventsStorage, DuesStorage,
]) {
  const { constructor: _constructor, ...methods } =
    Object.getOwnPropertyDescriptors(DomainStorage.prototype);
  Object.defineProperties(DatabaseStorage.prototype, methods);
}

export const storage = new DatabaseStorage();
