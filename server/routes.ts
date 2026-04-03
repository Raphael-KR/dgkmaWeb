import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPostSchema, insertPaymentSchema, insertPendingRegistrationSchema, insertCategorySchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {

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
    try {
      // Clear session data if any
      console.log("User logged out");
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.post("/api/auth/kakao/authorize", async (req, res) => {
    try {
      const { code } = req.body;
      const redirectUri = `${process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''}/kakao-callback`;

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY || '',
        redirect_uri: redirectUri,
        code,
      });
      if (process.env.KAKAO_CLIENT_SECRET) {
        params.append('client_secret', process.env.KAKAO_CLIENT_SECRET);
      }

      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.status(400).json(tokenData);
      }

      const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userRes.json();
      if (!userRes.ok) {
        return res.status(400).json(userInfo);
      }

      res.json({
        kakaoId: userInfo.id.toString(),
        email: userInfo.kakao_account?.email || `user${userInfo.id}@example.com`,
        name: userInfo.properties?.nickname || userInfo.kakao_account?.profile?.nickname || '카카오 사용자',
        accessToken: tokenData.access_token,
      });
    } catch (error) {
      console.error('Kakao OAuth authorize error:', error);
      res.status(500).json({ message: 'Kakao authorization failed' });
    }
  });

  app.post("/api/auth/kakao", async (req, res) => {
    try {
      const { kakaoId, email, name, accessToken } = req.body;
      
      console.log("Kakao auth request:", { kakaoId, email, name });
      
      // Check if user exists
      let user = await storage.getUserByKakaoId(kakaoId);
      
      if (!user) {
        // Check if alumni exists in Google Sheets first
        const { googleSheetsService } = await import("./google-sheets");
        const alumniMatches = await googleSheetsService.findAlumniByName(name);
        
        if (alumniMatches.length > 0) {
          console.log(`Auto-registering verified alumni: ${name}`);
          
          // Check if user already exists with this email or kakaoId
          const existingUserByEmail = await storage.getUserByEmail?.(email);
          const existingUserByKakao = await storage.getUserByKakaoId?.(kakaoId);
          
          if (existingUserByEmail) {
            console.log("User already exists with this email, logging in");
            res.json({ user: existingUserByEmail, token: "kakao-jwt-token" });
            return;
          }
          
          if (existingUserByKakao) {
            console.log("User already exists with this KakaoId, logging in");
            res.json({ user: existingUserByKakao, token: "kakao-jwt-token" });
            return;
          }
          
          user = await storage.createUser({
            kakaoId,
            email,
            name,
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
            userData: { kakaoId, email, name, kakaoSync: true },
          });
          
          return res.status(202).json({ 
            message: "가입 신청이 접수되었습니다",
            description: "관리자 승인 후 이용 가능합니다. 카카오톡으로 결과를 알려드리겠습니다.",
            requiresApproval: true 
          });
        }
      } else {
        // Enable KakaoSync for existing users
        if (!user.kakaoSyncEnabled) {
          user = await storage.updateUser(user.id, { kakaoSyncEnabled: true });
        }
        console.log("Existing user login:", user);
      }
      
      res.json({ user, token: "kakao-jwt-token" });
    } catch (error) {
      console.error("Kakao auth error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: "Authentication failed", error: errorMessage });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    // Mock authentication - in production, verify JWT token
    const userId = 1; // Extract from JWT
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    
    res.json({ user });
  });

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
  app.post("/api/obituary/parse", async (req, res) => {
    try {
      const { url } = req.body;
      
      // Mock obituary parsing - implement with cheerio in production
      const category = await storage.getCategoryByName("obituary");
      const mockParsedData = {
        title: "故 이○○ 동문 부친상",
        content: "1998년 졸업생 이○○ 동문의 부친께서 향년 78세로 별세하셨습니다.",
        categoryId: category?.id || 3
      };
      
      res.json(mockParsedData);
    } catch (error) {
      res.status(500).json({ message: "Failed to parse obituary URL" });
    }
  });

  // Payments routes
  app.get("/api/payments/user/:userId", async (req, res) => {
    try {
      const payments = await storage.getPaymentsByUser(parseInt(req.params.userId));
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
      
      // If approved, create user account
      if (status === "approved" && registration.userData) {
        const userData = registration.userData as any;
        await storage.createUser({
          kakaoId: userData.kakaoId,
          email: userData.email,
          name: userData.name,
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
