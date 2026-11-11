import { users, pendingRegistrations, type PendingRegistration } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  lockRegistrationIdentities,
  markKakaoIdentityTerminated,
} from "../identity/registration-support";
import { memberRegistrationData } from "./pending-registration-data";
import { approveRegistration } from "./registration-approval";

export class RegistrationStateConflictError extends Error {
  constructor(message = "승인 상태가 변경되었습니다. 목록을 다시 확인해 주세요.") {
    super(message);
    this.name = "RegistrationStateConflictError";
  }
}

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withPendingDecision<T>(
  id: number,
  expectedStatus: "pending" | "rejected",
  decide: (tx: RegistrationTransaction, registration: PendingRegistration) => Promise<T>,
): Promise<T | undefined> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.id, id));
    if (!candidate) return undefined;
    await lockRegistrationIdentities(tx, candidate.kakaoId, candidate.email);
    const [registration] = await tx
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.id, id))
      .for("update");
    if (!registration) return undefined;
    if (
      registration.status !== expectedStatus ||
      registration.kakaoId !== candidate.kakaoId ||
      registration.email !== candidate.email
    ) {
      throw new RegistrationStateConflictError();
    }
    return decide(tx, registration);
  });
}

async function suspendMemberSessions(tx: RegistrationTransaction, userId: number) {
  await tx
    .update(users)
    .set({ isVerified: false, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await tx.execute(sql`delete from "session" where sess ->> 'userId' = ${String(userId)}`);
}

export class RegistrationDecisionStorage {
  async rejectPendingRegistration(id: number): Promise<PendingRegistration | undefined> {
    return withPendingDecision(id, "pending", async (tx, registration) => {
      const [member] = await tx
        .select()
        .from(users)
        .where(eq(users.kakaoId, registration.kakaoId))
        .for("update");
      // 인증 완료 회원의 낡은 신청을 거부해서 승인 취소 절차를 우회하지 않는다.
      if (member?.isVerified) throw new RegistrationStateConflictError();
      await markKakaoIdentityTerminated(tx, registration.kakaoId, registration.email);
      if (member) await suspendMemberSessions(tx, member.id);
      const [updated] = await tx
        .update(pendingRegistrations)
        .set({ status: "rejected" })
        .where(eq(pendingRegistrations.id, id))
        .returning();
      return updated;
    });
  }

  async deleteRejectedRegistration(
    id: number,
    beforeDelete: (registration: PendingRegistration) => Promise<void>,
  ): Promise<{ id: number } | undefined> {
    return withPendingDecision(id, "rejected", async (tx, registration) => {
      const [member] = await tx
        .select()
        .from(users)
        .where(eq(users.kakaoId, registration.kakaoId))
        .for("update");
      if (member?.isVerified) throw new RegistrationStateConflictError();
      await beforeDelete(registration);
      await markKakaoIdentityTerminated(tx, registration.kakaoId, registration.email);
      if (member) {
        await suspendMemberSessions(tx, member.id);
        await tx.update(users).set({ kakaoSyncEnabled: false }).where(eq(users.id, member.id));
      }
      // 승인된 삭제 범위는 신청과 카카오 연결이다. 회원·명부·콘텐츠는 건드리지 않는다.
      await tx
        .delete(pendingRegistrations)
        .where(eq(pendingRegistrations.kakaoId, registration.kakaoId));
      return { id: registration.id };
    });
  }

  async reopenPendingRegistration(id: number): Promise<PendingRegistration | undefined> {
    return withPendingDecision(id, "rejected", async (tx, registration) => {
      const [member] = await tx
        .select({ isVerified: users.isVerified })
        .from(users)
        .where(eq(users.kakaoId, registration.kakaoId));
      if (member?.isVerified) throw new RegistrationStateConflictError();
      const [updated] = await tx
        .update(pendingRegistrations)
        .set({ status: "pending" })
        .where(eq(pendingRegistrations.id, id))
        .returning();
      return updated;
    });
  }

  async approvePendingRegistration(id: number): Promise<PendingRegistration | undefined> {
    return withPendingDecision(id, "pending", approveRegistration);
  }

  async cancelMemberApproval(
    userId: number,
    actorId: number,
  ): Promise<PendingRegistration | undefined> {
    if (userId === actorId)
      throw new RegistrationStateConflictError("본인의 승인은 취소할 수 없습니다.");
    return db.transaction(async (tx) => {
      // 두 관리자가 서로의 승인을 동시에 취소해 관리자가 없어지는 경쟁을 막는다.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('registry:approval-cancellation', 0))`,
      );
      const [actor] = await tx
        .select({ isAdmin: users.isAdmin, isVerified: users.isVerified })
        .from(users)
        .where(eq(users.id, actorId));
      if (!actor?.isAdmin || !actor.isVerified)
        throw new RegistrationStateConflictError("현재 관리자 권한을 확인할 수 없습니다.");
      const [candidate] = await tx.select().from(users).where(eq(users.id, userId));
      if (!candidate) return undefined;
      await lockRegistrationIdentities(tx, candidate.kakaoId ?? "", candidate.email);
      const [member] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!member) return undefined;
      if (
        !member.isVerified ||
        member.kakaoId !== candidate.kakaoId ||
        member.email !== candidate.email
      )
        throw new RegistrationStateConflictError();
      if (!member.kakaoId)
        throw new RegistrationStateConflictError(
          "카카오 식별정보가 없어 승인 취소를 처리할 수 없습니다.",
        );

      await markKakaoIdentityTerminated(tx, member.kakaoId, member.email);
      await suspendMemberSessions(tx, member.id);
      const [existing] = await tx
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.kakaoId, member.kakaoId))
        .orderBy(desc(pendingRegistrations.id))
        .for("update");
      const values = {
        kakaoId: member.kakaoId,
        email: member.email,
        name: member.name,
        userData: memberRegistrationData(member),
        status: "pending",
      };
      if (existing) {
        // 같은 회원의 이전 신청 행은 남기되 현재 대기는 한 건으로 모은다.
        await tx
          .update(pendingRegistrations)
          .set({ status: "approved" })
          .where(eq(pendingRegistrations.kakaoId, member.kakaoId));
        const [updated] = await tx
          .update(pendingRegistrations)
          .set(values)
          .where(eq(pendingRegistrations.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx.insert(pendingRegistrations).values(values).returning();
      return created;
    });
  }
}
