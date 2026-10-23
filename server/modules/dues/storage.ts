import { payments, ANNUAL_DUES, type Payment, type InsertPayment, type MembershipStatus } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { koreaCalendarYear } from "../../lib/korea-date";
import type { DuesStorageContract } from "./storage-contract";

export class DuesStorage implements DuesStorageContract {
  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return await db.select().from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(insertPayment).returning();
    return payment;
  }

  // 권리회원 등급 판정 — 당해년도 "연회비" 완납자만 권리회원(결제 연동 없음).
  // 완납 기준: type='연회비' + status='completed' 합계가 연회비 기준액(ANNUAL_DUES) 이상.
  // (기타 납부·부분 납부·미완료 건은 등급 판정에서 제외)
  async getMembershipStatus(userId: number): Promise<MembershipStatus> {
    const year = koreaCalendarYear();
    const all = await this.getPaymentsByUser(userId); // createdAt desc 정렬
    // 당해년도 완료된 연회비 납부만 집계.
    const completedDues = all.filter(
      (p) => p.year === year && p.type === "연회비" && p.status === "completed",
    );
    const paidAmount = completedDues.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const isPaid = paidAmount >= ANNUAL_DUES;
    return {
      year,
      tier: isPaid ? "권리회원" : "일반회원",
      isPaid,
      paidAmount,
      annualDues: ANNUAL_DUES,
      currentYearPayment: completedDues[0]
        ? { createdAt: completedDues[0].createdAt }
        : null,
    };
  }
}
