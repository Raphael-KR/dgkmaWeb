import type { Payment, InsertPayment, MembershipStatus } from "@shared/schema";

export interface DuesStorageContract {
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getMembershipStatus(userId: number): Promise<MembershipStatus>;
}
