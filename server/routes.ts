import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPostSchema, insertPaymentSchema, insertPendingRegistrationSchema, insertCategorySchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/kakao", async (req, res) => {
    try {
      const { kakaoId, email, name } = req.body;
      
      // Check if user exists
      let user = await storage.getUserByKakaoId(kakaoId);
      
      if (!user) {
        // Check if alumni exists in database
        const alumni = await storage.findAlumniByName(name);
        
        if (alumni.length > 0) {
          // Auto-register if alumni found
          user = await storage.createUser({
            kakaoId,
            email,
            name,
            isVerified: true,
          });
          
          // Match with alumni record
          const exactMatch = alumni.find(a => a.name === name);
          if (exactMatch) {
            await storage.updateAlumniMatch(exactMatch.id, user.id);
          }
        } else {
          // Create pending registration
          await storage.createPendingRegistration({
            kakaoId,
            email,
            name,
            userData: { kakaoId, email, name },
          });
          
          return res.status(202).json({ 
            message: "Registration pending approval",
            requiresApproval: true 
          });
        }
      }
      
      res.json({ user, token: "mock-jwt-token" });
    } catch (error) {
      res.status(500).json({ message: "Authentication failed" });
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

  const httpServer = createServer(app);
  return httpServer;
}
