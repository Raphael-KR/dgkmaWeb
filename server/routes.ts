import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPostSchema, insertPaymentSchema, insertPendingRegistrationSchema, insertCategorySchema, updateProfileSchema, REGION_OPTIONS } from "@shared/schema";
import { z } from "zod";
import { parseObituarySms } from "./obituary-parser";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

// 카카오 인증/온보딩 디버그 로그 게이팅. 운영 환경에서는 기본 OFF.
//   - DEBUG_KAKAO_AUTH=true → 상세 로그 ON (성공 경로 포함).
//   - 미설정/false           → 성공 경로의 디버그 로그 미출력.
//   - 실패/에러 로그(token exchange failed, session save failed 등)는 게이팅과 무관하게 항상 출력.
function isKakaoDebugEnabled(): boolean {
  return process.env.DEBUG_KAKAO_AUTH === "true";
}

export async function registerRoutes(app: Express): Promise<Server> {
  // 카카오 OAuth 환경변수 부팅 검증 — DEBUG_KAKAO_AUTH=true 일 때만 1회 출력.
  //  - restApiKeyPrefix 가 카카오 콘솔 [앱 설정 > 앱 키 > REST API 키] 앞 6자리와
  //    일치해야 token exchange 성공 (불일치 시 KOE114 / KOE303 발생).
  //  - 아래 prefix 와 token body debug 의 clientIdPrefix 는 항상 같아야 함.
  //  - 값 전체값은 절대 출력하지 않음 (마스킹).
  if (isKakaoDebugEnabled()) {
    const restKey = process.env.KAKAO_REST_API_KEY;
    console.log('[Kakao OAuth] env check:', {
      restApiKeyPrefix: restKey ? restKey.substring(0, 6) + '...' : null,
      hasClientSecret: !!process.env.KAKAO_CLIENT_SECRET,
      redirectUri: process.env.KAKAO_REDIRECT_URI || '(env 미설정 — Origin/Referer fallback 사용)',
    });
  }

  // Auth routes
  // Simple auth callback for development (Supabase OAuth 사용 안함)
  app.get("/api/auth/callback", async (req, res) => {
    try {
      console.log("Auth callback - redirecting to home");
      return res.redirect(`${process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''}/`);
    } catch (error) {
      console.error("Auth callback error:", error);
      return res.redirect(`${process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''}/login?error=server_error`);
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      console.log("User logged out");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });

  app.post("/api/auth/kakao/authorize", async (req, res) => {
    try {
      const { code } = req.body;

      // ⚠️ token exchange 의 client_id 는 반드시 process.env.KAKAO_REST_API_KEY 만 사용.
      //   - KAKAO_CLIENT_ID, VITE_KAKAO_REST_API_KEY, KAKAO_ADMIN_KEY 등 다른 env 로 fallback ❌
      //   - 클라이언트 인가 단계와 서버 토큰 단계 모두 REST API 키를 써서 client_id 일치 보장
      //     (v5 는 REST authorize URL 직접 이동 흐름 — JS SDK 미사용).
      //   - KAKAO_REST_API_KEY 누락 시 빈 문자열로 요청하지 말고 명시적 에러 반환 (KOE114 회피)
      const clientId = process.env.KAKAO_REST_API_KEY;
      if (!clientId) {
        console.error('[Kakao OAuth] KAKAO_REST_API_KEY env is missing');
        return res.status(500).json({
          message: 'Kakao 앱 설정 오류',
          description: '서버에 KAKAO_REST_API_KEY 환경변수가 설정되어 있지 않습니다.',
        });
      }

      // redirect_uri 결정 우선순위 (인가 단계와 토큰 단계가 byte-for-byte 동일해야 KOE114 회피):
      //   1) KAKAO_REDIRECT_URI env  — 명시적 고정값 (가장 권장)
      //   2) dev 환경                — http://localhost:5173/kakao-callback
      //   3) Origin 헤더             — 브라우저가 보낸 origin (path 없음, 안전)
      //   4) Referer 헤더의 origin    — URL 파싱하여 origin만 추출 (referer는 path/query 포함되므로 그대로 쓰면 ❌)
      //   5) APP_URL env             — 배포 환경별 fallback
      //   6) https://dgkma.replit.app — 마지막 fallback
      let redirectUri: string;
      if (process.env.KAKAO_REDIRECT_URI) {
        redirectUri = process.env.KAKAO_REDIRECT_URI;
      } else if (process.env.NODE_ENV === 'development') {
        redirectUri = 'http://localhost:5173/kakao-callback';
      } else {
        let baseUrl = '';
        const originHeader = req.headers.origin;
        const refererHeader = req.headers.referer;
        if (originHeader) {
          baseUrl = originHeader;
        } else if (refererHeader) {
          // ⚠️ referer는 path/query 포함 가능 — origin만 추출해야 함.
          // 예: "https://dgkma.replit.app/kakao-callback?code=..." → "https://dgkma.replit.app"
          try {
            baseUrl = new URL(refererHeader).origin;
          } catch {
            baseUrl = '';
          }
        }
        if (!baseUrl) {
          baseUrl = process.env.APP_URL || 'https://dgkma.replit.app';
        }
        redirectUri = `${baseUrl}/kakao-callback`;
      }

      // body 구성: 카카오 스펙(application/x-www-form-urlencoded)에 맞춰 정확한 파라미터 이름 사용.
      // grant_type / client_id / redirect_uri / code (필수) + client_secret (선택, 콘솔 활성화 시 필수).
      // ⚠️ 파라미터 이름 변형 금지 (redirectUri, redirectURL 등은 카카오가 인식 ❌).
      const params = new URLSearchParams();
      params.set('grant_type', 'authorization_code');
      params.set('client_id', clientId);
      params.set('redirect_uri', redirectUri);
      params.set('code', String(code ?? ''));
      if (process.env.KAKAO_CLIENT_SECRET) {
        // 카카오 디벨로퍼스 [보안 > Client Secret] 활성화 시 필수.
        // ⚠️ "카카오 로그인용" 클라이언트 시크릿만 사용 — 비즈니스 인증용 시크릿 금지.
        params.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
      }

      // Safe logging — DEBUG_KAKAO_AUTH=true 일 때만 출력. 전체값은 절대 노출 ❌ (모두 prefix 마스킹).
      //   같은 TEST 앱이라면 콘솔 [앱 설정 > 앱 키]의 REST API 키 앞 6자리가 clientIdPrefix와 일치해야 함.
      //   토큰 교환 실패 시의 에러 로그는 게이팅과 무관하게 항상 출력 (장애 진단용).
      if (isKakaoDebugEnabled()) {
        console.log('[Kakao OAuth] token body debug:', {
          url: 'https://kauth.kakao.com/oauth/token',
          contentType: 'application/x-www-form-urlencoded',
          bodyKeys: Array.from(params.keys()),
          bodyLength: params.toString().length,
          grant_type: params.get('grant_type'),
          clientIdPrefix: clientId.substring(0, 6) + '...',
          redirect_uri: params.get('redirect_uri'),
          codePrefix: String(code ?? '').substring(0, 8) + '...',
          hasClientSecret: !!process.env.KAKAO_CLIENT_SECRET,
          clientSecretPrefix: process.env.KAKAO_CLIENT_SECRET
            ? process.env.KAKAO_CLIENT_SECRET.substring(0, 4) + '...'
            : null,
        });
      }

      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        // 카카오 응답 error/error_description/error_code 그대로 전달 (디버깅용)
        console.error('[Kakao OAuth] token exchange failed:', {
          redirectUri,
          status: tokenRes.status,
          error: tokenData?.error,
          error_description: tokenData?.error_description,
          error_code: tokenData?.error_code,
        });
        return res.status(400).json({
          message: '카카오 토큰 교환에 실패했습니다',
          error: tokenData?.error,
          error_description: tokenData?.error_description,
          error_code: tokenData?.error_code,
          kakao: tokenData,
        });
      }

      // ⚠️ HTTPS 응답 보장은 요청 단계에서 박음 — 수신값은 변형 ❌ (카카오 원본 보존 원칙)
      const userRes = await fetch('https://kapi.kakao.com/v2/user/me?secure_resource=true', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userRes.json();
      if (!userRes.ok) {
        return res.status(400).json(userInfo);
      }

      // 이메일 동의 검증 (fallback 제거 — 가짜 user${id}@example.com 제거)
      if (!userInfo.kakao_account?.email) {
        return res.status(400).json({
          message: "이메일 동의가 필요합니다",
          description: "카카오 로그인 시 이메일 제공에 동의해주세요."
        });
      }

      // 휴대전화번호 동의 검증 (휴대전화번호 제공 동의 기반 가입 제한 — 권리회원 카카오톡 팀채팅방 단일 채널 운영 정책)
      if (!userInfo.kakao_account?.phone_number) {
        return res.status(400).json({
          message: "휴대전화번호 동의가 필요합니다",
          description: "본 서비스는 휴대전화번호 제공에 동의한 카카오계정 사용자만 가입 가능합니다. 카카오 로그인 시 휴대전화번호 제공에 동의해주세요."
        });
      }

      // 성명(이름) 동의 검증 — fallback 금지 (kakao_account.profile.nickname / properties.nickname / "카카오 사용자" 모두 ❌)
      if (!userInfo.kakao_account?.name) {
        return res.status(400).json({
          message: "성명 동의가 필요합니다",
          description: "카카오 로그인 시 이름 제공에 동의해주세요."
        });
      }

      // ⚠️ 카카오 응답 원본 보존 원칙
      //  - phone_number를 "01012345678"로 정규화 ❌ → 명부 매칭은 server/google-sheets.ts에서 단방향 변환
      //  - kakao_account.name이 성명 원본 (profile.nickname / properties.nickname / "카카오 사용자" fallback 모두 ❌)
      //  - profile_image_url의 http/https 임의 변경 ❌ (HTTPS는 1단계 secure_resource=true로 보장)
      res.json({
        kakaoId: userInfo.id.toString(),
        email: userInfo.kakao_account.email,                                    // 원본 보존 (lowercase 변환 ❌)
        name: userInfo.kakao_account.name,                                      // ⚠️ kakao_account.name 원본
        profileImage: userInfo.kakao_account.profile?.profile_image_url || null, // 원본 그대로 (http/https 치환 ❌)
        phoneNumber: userInfo.kakao_account.phone_number,                       // ⚠️ 카카오 응답 원본 그대로
        birthday: userInfo.kakao_account.birthday || null,                      // 원본 "MMDD"
        birthdayType: userInfo.kakao_account.birthday_type || null,             // 원본 "SOLAR" | "LUNAR"
        isLeapMonth: userInfo.kakao_account.is_leap_month ?? null,              // 미동의 시 null
        accessToken: tokenData.access_token,
      });
    } catch (error) {
      console.error('Kakao OAuth authorize error:', error);
      res.status(500).json({ message: 'Kakao authorization failed' });
    }
  });

  app.post("/api/auth/kakao", async (req, res) => {
    try {
      const { kakaoId, email, name, profileImage, phoneNumber, birthday, birthdayType, isLeapMonth, accessToken } = req.body;

      console.log("Kakao auth request:", { kakaoId, email, name });

      // Check if user exists
      let user = await storage.getUserByKakaoId(kakaoId);

      if (!user) {
        // v5: 휴대전화번호 1순위 + 이름 1건일 때만 매칭. 동명이인은 자동 등록 차단.
        const { googleSheetsService } = await import("./google-sheets");
        const alumniMatches = await googleSheetsService.findAlumniByPhoneAndName(phoneNumber, name);

        if (alumniMatches.length > 0) {
          console.log(`Auto-registering verified alumni: ${name}`);

          // Check if user already exists with this email or kakaoId
          const existingUserByEmail = await storage.getUserByEmail?.(email);
          const existingUserByKakao = await storage.getUserByKakaoId?.(kakaoId);

          if (existingUserByEmail) {
            console.log("User already exists with this email, logging in");
            // ⚠️ updateUser 반환값을 사용 — stale 응답 방지
            const updates: Partial<typeof existingUserByEmail> = {};
            if (profileImage && !existingUserByEmail.profileImage) updates.profileImage = profileImage;
            if (phoneNumber && !existingUserByEmail.phoneNumber) updates.phoneNumber = phoneNumber;
            if (birthday && !existingUserByEmail.birthday) {
              updates.birthday = birthday;
              updates.birthdayType = birthdayType;
              updates.isLeapMonth = isLeapMonth;
            }
            let finalUser = existingUserByEmail;
            if (Object.keys(updates).length > 0) {
              const updatedUser = await storage.updateUser(existingUserByEmail.id, updates);
              if (updatedUser) {
                finalUser = updatedUser;
              }
            }
            // ⚠️ session save 완료 후 응답 — 비동기 DB write 가 끝나기 전에 클라이언트가
            //    다음 요청을 보내면 세션 인식 실패(401) 발생.
            req.session.userId = finalUser.id;
            req.session.save((err) => {
              if (err) {
                console.error("[Kakao Auth] session save failed:", err);
                return res.status(500).json({ message: "세션 저장에 실패했습니다" });
              }
              return res.json({ user: finalUser });
            });
            return;
          }

          if (existingUserByKakao) {
            console.log("User already exists with this KakaoId, logging in");
            const updates: Partial<typeof existingUserByKakao> = {};
            if (profileImage && !existingUserByKakao.profileImage) updates.profileImage = profileImage;
            if (phoneNumber && !existingUserByKakao.phoneNumber) updates.phoneNumber = phoneNumber;
            if (birthday && !existingUserByKakao.birthday) {
              updates.birthday = birthday;
              updates.birthdayType = birthdayType;
              updates.isLeapMonth = isLeapMonth;
            }
            let finalUser = existingUserByKakao;
            if (Object.keys(updates).length > 0) {
              const updatedUser = await storage.updateUser(existingUserByKakao.id, updates);
              if (updatedUser) {
                finalUser = updatedUser;
              }
            }
            req.session.userId = finalUser.id;
            req.session.save((err) => {
              if (err) {
                console.error("[Kakao Auth] session save failed:", err);
                return res.status(500).json({ message: "세션 저장에 실패했습니다" });
              }
              return res.json({ user: finalUser });
            });
            return;
          }

          user = await storage.createUser({
            kakaoId,
            email,
            name,
            profileImage,
            phoneNumber,
            birthday,
            birthdayType,
            isLeapMonth,
            graduationYear: alumniMatches[0]?.graduationDate
              ? parseInt(alumniMatches[0].graduationDate.substring(0, 4), 10) || null
              : null,
            isVerified: true,
            kakaoSyncEnabled: true,
          });
          console.log("Auto-registered verified alumni:", user);
        } else {
          // For non-alumni, still create pending registration but indicate KakaoSync
          await storage.createPendingRegistration({
            kakaoId,
            email,
            name,
            userData: {
              kakaoId,
              email,
              name,
              profileImage,
              phoneNumber,
              birthday,
              birthdayType,
              isLeapMonth,
              kakaoSync: true,
            },
          });

          return res.status(202).json({
            message: "가입 신청이 접수되었습니다",
            description: "관리자 승인 후 이용 가능합니다. 카카오톡으로 결과를 알려드리겠습니다.",
            requiresApproval: true
          });
        }
      } else {
        // Existing user — fill missing v5 fields opportunistically (finalUser 패턴)
        const updates: Partial<typeof user> = {};
        if (!user.kakaoSyncEnabled) updates.kakaoSyncEnabled = true;
        if (profileImage && !user.profileImage) updates.profileImage = profileImage;
        if (phoneNumber && !user.phoneNumber) updates.phoneNumber = phoneNumber;
        if (birthday && !user.birthday) {
          updates.birthday = birthday;
          updates.birthdayType = birthdayType;
          updates.isLeapMonth = isLeapMonth;
        }
        if (Object.keys(updates).length > 0) {
          user = await storage.updateUser(user.id, updates);
        }
        console.log("Existing user login:", user);
      }

      if (!user) {
        return res.status(500).json({ message: "사용자 생성에 실패했습니다" });
      }

      const finalUser = user;
      req.session.userId = finalUser.id;
      req.session.save((err) => {
        if (err) {
          console.error("[Kakao Auth] session save failed:", err);
          return res.status(500).json({ message: "세션 저장에 실패했습니다" });
        }
        return res.json({ user: finalUser });
      });
    } catch (error) {
      console.error("Kakao auth error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: "Authentication failed", error: errorMessage });
    }
  });

  // v5 — 활동 지역(시/도) 입력 (온보딩 분기). 401 (no session) / 400 (invalid region).
  app.post("/api/users/activity-region", async (req, res) => {
    // safe log — DEBUG_KAKAO_AUTH=true 일 때만 출력. 민감 정보 제외, 세션/페이로드 형태만.
    if (isKakaoDebugEnabled()) {
      console.log("[ActivityRegion] save request:", {
        hasSession: !!req.session,
        sessionId: req.sessionID ? "present" : "missing",
        userId: req.session?.userId ?? null,
        bodyKeys: Object.keys(req.body ?? {}),
      });
    }

    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // body 필드명: activityRegion(권장) 또는 region(하위호환) 둘 다 허용.
    const region = req.body?.activityRegion ?? req.body?.region;
    if (!REGION_OPTIONS.includes(region)) {
      return res.status(400).json({ message: "Invalid region" });
    }

    // ⚠️ update 대상은 반드시 req.session.userId — body 로 userId 받지 않음 (보안).
    // ⚠️ DB 컬럼은 users.activityRegion (snake: activity_region).
    const updated = await storage.updateUser(req.session.userId, { activityRegion: region });
    if (!updated) {
      return res.status(500).json({ message: "지역 저장에 실패했습니다" });
    }
    res.json({ user: updated });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    return res.json({ user });
  });

  // 본인 프로필 수정 — 인증과 무관한 항목만 허용(activityRegion/birthday/birthdayType/
  // isLeapMonth/kakaoSyncEnabled). 이름·졸업년도·연락처 등 검증 항목은 변경 불가.
  // ⚠️ 대상은 항상 req.session.userId — body 로 userId 받지 않음(보안).
  app.patch("/api/users/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const data = updateProfileSchema.parse(req.body);
      if (data.activityRegion != null && !REGION_OPTIONS.includes(data.activityRegion as any)) {
        return res.status(400).json({ message: "유효하지 않은 활동지역입니다" });
      }
      const updated = await storage.updateUser(req.session.userId, data);
      if (!updated) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      res.json({ user: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "입력값이 올바르지 않습니다", errors: error.errors });
      }
      res.status(500).json({ message: "프로필 저장에 실패했습니다" });
    }
  });

  // 권리회원 등급/회비 납부 현황 — 세션 기준 본인만 조회.
  app.get("/api/membership/status", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const status = await storage.getMembershipStatus(req.session.userId);
      res.json(status);
    } catch (error) {
      console.error("Membership status error:", error);
      res.status(500).json({ message: "회원 등급 조회에 실패했습니다" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug/login", async (req, res) => {
      const user = await storage.getUser(1);
      if (!user) {
        return res.status(404).json({ message: "Debug user not found" });
      }
      req.session.userId = 1;
      res.json({ user });
    });
  }

  // Categories routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const validatedData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Posts routes
  app.get("/api/posts", async (req, res) => {
    try {
      const { category, limit } = req.query;
      const posts = await storage.getPosts(
        category as string, 
        limit ? parseInt(limit as string) : undefined
      );
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Search posts (must be before the /:id route)
  app.get("/api/posts/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim() === "") {
        return res.json([]);
      }

      const posts = await storage.searchPosts(query);
      res.json(posts);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ 
        message: "Failed to search posts", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(parseInt(req.params.id));
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/posts", async (req, res) => {
    try {
      const validatedData = insertPostSchema.parse(req.body);
      const post = await storage.createPost(validatedData);
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Obituary URL parsing route
  app.post("/api/obituary/parse", (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "text 필드가 필요합니다" });
      }
      const parsed = parseObituarySms(text);
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ message: "부고 문자 분석에 실패했습니다" });
    }
  });

  app.get("/api/obituaries", async (req, res) => {
    try {
      const list = await storage.getObituaries();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "부고 목록 조회에 실패했습니다" });
    }
  });

  app.post("/api/obituaries", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const obituary = await storage.createObituary({
        ...req.body,
        authorId: req.session.userId,
      });
      res.status(201).json(obituary);
    } catch (error) {
      res.status(500).json({ message: "부고 등록에 실패했습니다" });
    }
  });

  // Alumni directory (회원 전용) — 본인 기수/지부 범위 동문만 열람. q 로 이름·기수 검색.
  app.get("/api/alumni", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const viewer = await storage.getUser(userId);
      if (!viewer) {
        return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      }
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const result = await storage.getDirectoryAlumni(viewer, q);
      res.json(result);
    } catch (error) {
      console.error("Alumni directory error:", error);
      res.status(500).json({ message: "동문 명부 조회에 실패했습니다" });
    }
  });

  // Payments routes
  app.get("/api/payments/user/:userId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const targetUserId = parseInt(req.params.userId);
      // 본인 또는 관리자만 열람 가능 (타인 납부 내역 노출 방지).
      if (targetUserId !== sessionUserId) {
        const viewer = await storage.getUser(sessionUserId);
        if (!viewer?.isAdmin) {
          return res.status(403).json({ message: "권한이 없습니다" });
        }
      }
      const payments = await storage.getPaymentsByUser(targetUserId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const validatedData = insertPaymentSchema.parse(req.body);
      const payment = await storage.createPayment(validatedData);
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  // Admin routes
  app.get("/api/admin/pending-registrations", async (req, res) => {
    try {
      const registrations = await storage.getPendingRegistrations();
      res.json(registrations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending registrations" });
    }
  });

  app.patch("/api/admin/pending-registrations/:id", async (req, res) => {
    try {
      const { status } = req.body;
      const id = parseInt(req.params.id);
      
      const registration = await storage.updatePendingRegistrationStatus(id, status);
      
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" });
      }
      
      // If approved, create user account (v5 — profileImage/phoneNumber/birthday 3필드 보존)
      if (status === "approved" && registration.userData) {
        const userData = registration.userData as any;
        await storage.createUser({
          kakaoId: userData.kakaoId,
          email: userData.email,
          name: userData.name,
          profileImage: userData.profileImage,
          phoneNumber: userData.phoneNumber,
          birthday: userData.birthday,
          birthdayType: userData.birthdayType,
          isLeapMonth: userData.isLeapMonth,
          isVerified: true,
        });
      }
      
      res.json(registration);
    } catch (error) {
      res.status(500).json({ message: "Failed to update registration" });
    }
  });

  // Google Sheets 동기화 API (관리자 전용)
  app.post("/api/admin/sync-alumni", async (req, res) => {
    try {
      console.log('Alumni sync API called');
      
      // TODO: 관리자 권한 확인 추가
      const syncStats = await storage.syncAlumniFromGoogleSheets();
      
      const response = { 
        message: `Google Sheets 동기화 완료: ${syncStats.synced}/${syncStats.total}건 업데이트`,
        stats: syncStats
      };
      
      console.log('Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error("Alumni sync error:", error);
      res.status(500).json({ message: "동기화 실패", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // 동기화 진행상황 조회 API
  app.get("/api/admin/sync-progress", async (req, res) => {
    try {
      const { googleSheetsService } = await import("./google-sheets");
      const progress = googleSheetsService.getSyncProgress();
      res.json(progress);
    } catch (error) {
      console.error("Sync progress error:", error);
      res.status(500).json({ error: "진행상황 조회 실패" });
    }
  });

  // Google Sheets 연결 테스트 API
  app.get("/api/admin/test-google-sheets", async (req, res) => {
    try {
      const { googleSheetsService } = await import("./google-sheets");
      const isConnected = await googleSheetsService.testConnection();
      
      if (isConnected) {
        const sampleData = await googleSheetsService.fetchAlumniData();
        res.json({ 
          connected: true, 
          message: "Google Sheets 연결 성공",
          sampleCount: sampleData.length
        });
      } else {
        res.json({ 
          connected: false, 
          message: "Google Sheets 설정이 필요합니다" 
        });
      }
    } catch (error) {
      console.error("Google Sheets test error:", error);
      res.status(500).json({ 
        connected: false, 
        message: "Google Sheets 연결 실패",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
