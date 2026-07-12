import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { kakaoOAuthStates } from "@shared/schema";
import { db } from "./db";

export const KAKAO_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type KakaoOAuthStateBinding = {
  stateHash: string;
  sessionBindingHash: string;
  expiresAt: Date;
};

export interface KakaoOAuthStateStore {
  issue(binding: KakaoOAuthStateBinding): Promise<void>;
  consume(binding: Pick<KakaoOAuthStateBinding, "stateHash" | "sessionBindingHash">): Promise<boolean>;
}

function hashOAuthValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashKakaoOAuthState(state: string): string {
  return hashOAuthValue(state);
}

export function hashKakaoOAuthSessionBinding(sessionId: string): string {
  return hashOAuthValue(sessionId);
}

export function oauthStateHashesMatch(expectedHash: string, actualHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !/^[a-f0-9]{64}$/.test(actualHash)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(expectedHash, "hex"),
    Buffer.from(actualHash, "hex"),
  );
}

class PostgresKakaoOAuthStateStore implements KakaoOAuthStateStore {
  async issue(binding: KakaoOAuthStateBinding): Promise<void> {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.delete(kakaoOAuthStates).where(lt(kakaoOAuthStates.expiresAt, now));
      await tx.insert(kakaoOAuthStates)
        .values({ ...binding, createdAt: now })
        .onConflictDoUpdate({
          target: kakaoOAuthStates.sessionBindingHash,
          set: {
            stateHash: binding.stateHash,
            expiresAt: binding.expiresAt,
            createdAt: now,
          },
        });
    });
  }

  async consume(
    binding: Pick<KakaoOAuthStateBinding, "stateHash" | "sessionBindingHash">,
  ): Promise<boolean> {
    const consumed = await db.delete(kakaoOAuthStates)
      .where(and(
        eq(kakaoOAuthStates.stateHash, binding.stateHash),
        eq(kakaoOAuthStates.sessionBindingHash, binding.sessionBindingHash),
        gt(kakaoOAuthStates.expiresAt, new Date()),
      ))
      .returning({ stateHash: kakaoOAuthStates.stateHash });
    return consumed.length === 1;
  }
}

export const kakaoOAuthStateStore: KakaoOAuthStateStore =
  new PostgresKakaoOAuthStateStore();
