import type { User, InsertUser } from "@shared/schema";
import type { KakaoOAuthGeneration } from "./kakao-identity";

export interface IdentityStorageContract {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  getUserByNormalizedPhone(phoneNumber: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(
    id: number,
    user: Partial<InsertUser>,
    oauthGeneration?: KakaoOAuthGeneration,
  ): Promise<User | undefined>;
  finalizeKakaoLogin(
    userId: number,
    generation: KakaoOAuthGeneration,
    saveSession: () => Promise<void>,
  ): Promise<User>;
  deleteUserAccount(
    user: Pick<User, "id" | "kakaoId" | "email">,
    beforeDelete?: (user: User) => Promise<void>,
  ): Promise<void>;
}
