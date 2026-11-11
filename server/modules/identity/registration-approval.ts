import { pendingRegistrations } from "@shared/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";

export class RegistrationApprovalRequiredError extends Error {
  constructor(public readonly status: "pending" | "rejected") {
    super("Administrator approval is required.");
    this.name = "RegistrationApprovalRequiredError";
  }
}

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 신원 잠금 안에서 확인한다. 재로그인으로 관리자의 거부·대기 결정을 지우지 않는다.
export async function findRegistrationHold(
  tx: RegistrationTransaction,
  kakaoId: string,
  email?: string,
) {
  const [registration] = await tx
    .select()
    .from(pendingRegistrations)
    .where(
      and(
        inArray(pendingRegistrations.status, ["pending", "rejected"]),
        or(
          eq(pendingRegistrations.kakaoId, kakaoId),
          email
            ? sql`lower(${pendingRegistrations.email}) = ${email.trim().toLowerCase()}`
            : undefined,
        ),
      ),
    )
    .orderBy(
      sql`case when ${pendingRegistrations.status} = 'rejected' then 0 else 1 end`,
      pendingRegistrations.id,
    )
    .limit(1);
  return registration;
}
