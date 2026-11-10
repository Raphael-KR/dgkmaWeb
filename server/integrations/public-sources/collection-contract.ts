import { z } from "zod";
import { NOTICE_TYPES } from "@shared/contracts/notices";

export type FieldEvidence = {
  field: string;
  value: string;
  url: string;
  locator: string;
  kind: "html" | "api" | "rendered" | "ocr";
  collectedAt: string;
};
const path = z
  .array(
    z.union([
      z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$-]{0,79}$/),
      z.number().int().min(0).max(100),
    ]),
  )
  .min(1)
  .max(12);
const field = z.enum([
  "deceasedName",
  "deceasedAge",
  "deathDate",
  "date",
  "time",
  "timeDefined",
  "place",
  "room",
  "floor",
  "cemetery",
  "crematorium",
  "contactPhone",
  "contactName",
  "clinicName",
  "partnerName",
  "accountBank",
  "accountNumber",
  "accountHolder",
  "mournerName",
  "mournerRelation",
  "relation",
  "visitationDeclined",
  "notes",
  "updatedAt",
  "groomName",
  "brideName",
  "groomFather",
  "groomMother",
  "brideFather",
  "brideMother",
  "weddingRelation",
  "eventName",
  "address",
  "meal",
  "parking",
  "flowerPolicy",
]);
export const collectionRuleSchema = z
  .object({
    schemaVersion: z.literal(1),
    domain: z.string().max(253),
    pagePattern: z.string().max(500),
    noticeTypes: z.array(z.enum(NOTICE_TYPES)).min(1).max(3).optional(),
    id: z
      .object({
        source: z.enum(["path", "query"]),
        key: z.string().max(80),
        transform: z.enum(["identity", "base64url"]),
      })
      .strict(),
    request: z.object({ method: z.literal("GET"), urlTemplate: z.string().max(1200) }).strict(),
    fields: z.array(z.object({ field, path }).strict()).min(3).max(60),
    shape: z
      .array(z.object({ path, type: z.enum(["string", "number", "boolean"]) }).strict())
      .min(3)
      .max(60),
  })
  .strict();
export type CollectionRule = z.infer<typeof collectionRuleSchema>;
export type StoredRule = { id: number; version: number; rule: CollectionRule };
export type RuleStore = {
  find(domain: string): Promise<StoredRule[]>;
  succeeded(id: number): Promise<void>;
  save(rule: CollectionRule): Promise<{ id: number; version: number }>;
};
export type CollectionResult = {
  text: string;
  evidence: FieldEvidence[];
  method: "stored-rule" | "static-html" | "discovered-api" | "browser" | "ocr";
  diagnostics: {
    stages: string[];
    requests: number;
    bytes: number;
    browser: boolean;
    ocrImages: number;
    browserStats?: { frames: number; interactions: number; scrolls: number; ocrImages: number };
    rule?: { id: number; version: number; reused: boolean };
    warnings: string[];
  };
};
export type JsonObservation = { url: string; value: unknown };
export const LIMITS = {
  totalMs: 55_000,
  browserMs: 35_000,
  requests: 90,
  bytes: 32 * 1024 * 1024,
  assetBytes: 8 * 1024 * 1024,
  dataBytes: 512 * 1024,
  jsonResponses: 12,
  frames: 6,
  interactions: 8,
  images: 3,
} as const;
