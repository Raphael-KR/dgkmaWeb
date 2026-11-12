import { users, pendingRegistrations, type PendingRegistration } from "@shared/schema";
import { eq, ne, desc, and, asc, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { getApprovedMemberDetails } from "./approved-member-details";
import type { RegistrationApprovalStatus } from "@shared/contracts";
import { findRegistrationHold } from "../identity/registration-approval";
import { getPendingRegistrationReviews } from "./pending-registration-review";
import type {
  PendingRegistrationReviewInput,
  CreateOrRefreshPendingRegistrationResult,
} from "./storage-contract";
import {
  lockRegistrationIdentities,
  assertKakaoOAuthGenerationActive,
} from "../identity/registration-support";

// 신청 갱신과 상태별 조회. 관리자의 결정은 로그인 요청으로 덮어쓰지 않는다.
export class PendingRegistrationStorage {
  async getPendingRegistrations(
    status: "pending" | "rejected" = "pending",
  ): Promise<PendingRegistration[]> {
    return await db
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.status, status))
      .orderBy(desc(pendingRegistrations.createdAt));
  }

  async getPendingRegistrationReviews(status: RegistrationApprovalStatus = "pending") {
    if (status === "approved") {
      return getApprovedMemberDetails();
    }
    return getPendingRegistrationReviews(await this.getPendingRegistrations(status));
  }

  async createOrRefreshPendingRegistration(
    insertRegistration: PendingRegistrationReviewInput,
    oauthStartedAt: Date,
  ): Promise<CreateOrRefreshPendingRegistrationResult> {
    return db.transaction(async (tx) => {
      await lockRegistrationIdentities(tx, insertRegistration.kakaoId, insertRegistration.email);
      await assertKakaoOAuthGenerationActive(tx, {
        kakaoId: insertRegistration.kakaoId,
        email: insertRegistration.email,
        startedAt: oauthStartedAt,
      });

      const [registeredUser] = await tx
        .select()
        .from(users)
        .where(eq(users.kakaoId, insertRegistration.kakaoId))
        .limit(1);
      if (registeredUser?.isVerified) {
        return { kind: "registered", user: registeredUser };
      }

      const hold = await findRegistrationHold(
        tx,
        insertRegistration.kakaoId,
        insertRegistration.email,
      );
      if (hold && (hold.status === "rejected" || hold.kakaoId !== insertRegistration.kakaoId)) {
        return { kind: "pending", registration: hold };
      }

      const [emailConflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${insertRegistration.email.trim().toLowerCase()}`,
            registeredUser ? ne(users.id, registeredUser.id) : undefined,
          ),
        )
        .limit(1);
      const reviewedRegistration = emailConflict
        ? {
            ...insertRegistration,
            userData: {
              ...insertRegistration.userData,
              conflictReason: "email_conflict" as const,
            },
          }
        : insertRegistration;

      const matches = await tx
        .select()
        .from(pendingRegistrations)
        .where(
          and(
            eq(pendingRegistrations.status, "pending"),
            eq(pendingRegistrations.kakaoId, reviewedRegistration.kakaoId),
          ),
        )
        .orderBy(asc(pendingRegistrations.id))
        .for("update");

      const [existing, ...duplicates] = matches;
      if (existing) {
        if (duplicates.length > 0) {
          await tx.delete(pendingRegistrations).where(
            inArray(
              pendingRegistrations.id,
              duplicates.map(({ id }) => id),
            ),
          );
        }
        const [refreshed] = await tx
          .update(pendingRegistrations)
          .set({
            ...reviewedRegistration,
            status: "pending",
            createdAt: new Date(),
          })
          .where(eq(pendingRegistrations.id, existing.id))
          .returning();
        return { kind: "pending", registration: refreshed };
      }

      const [created] = await tx
        .insert(pendingRegistrations)
        .values({ ...reviewedRegistration, status: "pending" })
        .returning();
      return { kind: "pending", registration: created };
    });
  }
}
