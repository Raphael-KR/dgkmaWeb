import type { AdminPendingRegistrationDto, PendingRegistration } from "@shared/schema";

export function toAdminPendingRegistrationDto(
  registration: Pick<
    PendingRegistration,
    "id" | "name" | "email" | "status" | "createdAt"
  >,
): AdminPendingRegistrationDto {
  return {
    id: registration.id,
    name: registration.name,
    email: registration.email,
    status: registration.status,
    createdAt: registration.createdAt?.toISOString() ?? null,
  };
}
