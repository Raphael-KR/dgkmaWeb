import type { User, InsertUser } from "@shared/schema";
import type { KakaoOAuthGeneration } from "./kakao-identity";

export interface IdentityStorageContract {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByKakaoId(kakaoId: string): Promise<User | undefined>;
  getUserByNormalizedPhone(phoneNumber: string): Promise<User | undefined>;
  updateUser(
    id: string,
    user: Partial<InsertUser>,
    oauthGeneration?: KakaoOAuthGeneration,
  ): Promise<User | undefined>;
  finalizeKakaoLogin(
    userId: string,
    generation: KakaoOAuthGeneration,
    saveSession: () => Promise<void>,
  ): Promise<User>;
  deleteUserAccount(
    user: Pick<User, "id" | "kakaoId" | "email">,
    beforeDelete?: (user: User) => Promise<void>,
  ): Promise<void>;
}
