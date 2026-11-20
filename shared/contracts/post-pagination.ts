import { z } from "zod";

export const POST_PAGE_SIZE = 50;
export const postPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(POST_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});
