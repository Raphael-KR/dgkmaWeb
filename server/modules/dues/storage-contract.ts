import type { Payment, InsertPayment, MembershipStatus } from "@shared/schema";

export interface DuesStorageContract {
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getPayment(id: number): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getMembershipStatus(userId: number): Promise<MembershipStatus>;
}
