import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { kakaoOAuthStates } from "@shared/schema";
import { db } from "./db";

export const KAKAO_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type KakaoOAuthStateBinding = {
  stateHash: string;
  sessionBindingHash: string;
  startedAt: Date;
  expiresAt: Date;
};

export type KakaoOAuthStateIssue = Pick<
  KakaoOAuthStateBinding,
  "stateHash" | "sessionBindingHash"
> & Partial<Pick<KakaoOAuthStateBinding, "startedAt" | "expiresAt">>;

export interface KakaoOAuthStateStore {
  issue(binding: KakaoOAuthStateIssue): Promise<KakaoOAuthStateBinding>;
  consume(binding: Pick<
    KakaoOAuthStateBinding,
    "stateHash" | "sessionBindingHash" | "startedAt"
  >): Promise<boolean>;
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
  async issue(binding: KakaoOAuthStateIssue): Promise<KakaoOAuthStateBinding> {
    const now = new Date();
    return db.transaction(async (tx) => {
      await tx.delete(kakaoOAuthStates).where(lt(kakaoOAuthStates.expiresAt, now));
      const startedAt = binding.startedAt
        ?? sql<Date>`date_trunc('milliseconds', clock_timestamp())`;
      const expiresAt = binding.expiresAt
        ?? sql<Date>`date_trunc('milliseconds', clock_timestamp()) + interval '10 minutes'`;
      const [issued] = await tx.insert(kakaoOAuthStates)
        .values({
          stateHash: binding.stateHash,
          sessionBindingHash: binding.sessionBindingHash,
          startedAt,
          expiresAt,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: kakaoOAuthStates.sessionBindingHash,
          set: {
            stateHash: binding.stateHash,
            startedAt,
            expiresAt,
            createdAt: now,
          },
        })
        .returning({
          stateHash: kakaoOAuthStates.stateHash,
          sessionBindingHash: kakaoOAuthStates.sessionBindingHash,
          startedAt: kakaoOAuthStates.startedAt,
          expiresAt: kakaoOAuthStates.expiresAt,
        });
      return issued;
    });
  }

  async consume(
    binding: Pick<
      KakaoOAuthStateBinding,
      "stateHash" | "sessionBindingHash" | "startedAt"
    >,
  ): Promise<boolean> {
    const consumed = await db.delete(kakaoOAuthStates)
      .where(and(
        eq(kakaoOAuthStates.stateHash, binding.stateHash),
        eq(kakaoOAuthStates.sessionBindingHash, binding.sessionBindingHash),
        eq(kakaoOAuthStates.startedAt, binding.startedAt),
        gt(kakaoOAuthStates.expiresAt, new Date()),
      ))
      .returning({ stateHash: kakaoOAuthStates.stateHash });
    return consumed.length === 1;
  }
}

export const kakaoOAuthStateStore: KakaoOAuthStateStore =
  new PostgresKakaoOAuthStateStore();
