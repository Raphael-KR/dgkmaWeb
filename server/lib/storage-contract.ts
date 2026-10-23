import type { IdentityStorageContract } from "../modules/identity/storage-contract";
import type { RegistryStorageContract } from "../modules/registry/storage-contract";
import type { ContentStorageContract } from "../modules/content/storage-contract";
import type { EventsStorageContract } from "../modules/events/storage-contract";
import type { DuesStorageContract } from "../modules/dues/storage-contract";

// The legacy aggregate is composition only; each domain owns its method contract.
export interface IStorage extends
  IdentityStorageContract,
  RegistryStorageContract,
  ContentStorageContract,
  EventsStorageContract,
  DuesStorageContract {}
