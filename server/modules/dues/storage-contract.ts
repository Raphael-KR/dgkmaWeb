import type { Payment, InsertPayment, MembershipStatus } from "@shared/schema";

export interface DuesStorageContract {
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getMembershipStatus(userId: string): Promise<MembershipStatus>;
}
