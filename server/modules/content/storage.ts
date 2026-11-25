import { normalizePostDocument } from "@shared/editor/post-document";
import type { NoticeType, UpdatePost } from "@shared/contracts";
import { postBodyTextExpression } from "./post-body-query";
import { bandAttachmentPathSchema } from "@shared/contracts/post-input";
import { bandContainerId } from "./band-media-paths";
import {
  users,
  posts,
  categories,
  comments,
  type Post,
  type InsertPost,
  type Category,
  type InsertCategory,
} from "@shared/schema";
import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { affiliationAtWriting } from "./author-affiliation";
import type { ContentStorageContract, PublishedPost, PostViewer } from "./storage-contract";

const publicColumns = {
  id: posts.id,
  title: posts.title,
  content: posts.content,
  categoryId: posts.categoryId,
  authorId: posts.authorId,
  importData: posts.importData,
  authorName: sql<
    string | null
  >`case when ${posts.authorId} is not null then ${users.name} else ${posts.authorName} end`,
  authorAffiliation: sql<
    string | null
  >`case when ${posts.authorId} is not null then ${posts.authorAffiliation} end`,
  isPublished: posts.isPublished,
  isHidden: posts.isHidden,
  revision: posts.revision,
  imageUrls: posts.imageUrls,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  publishedAt: posts.publishedAt,
  eventType: sql<NoticeType | null>`${posts.eventData}->>'eventType'`,
  category: categories,
};
const visible = () => and(eq(posts.isPublished, true), eq(posts.isHidden, false));

function readablePost(viewer?: PostViewer) {
  return and(
    eq(posts.isPublished, true),
    viewer?.isAdmin
      ? undefined
      : or(eq(posts.isHidden, false), viewer ? eq(posts.authorId, viewer.id) : undefined),
  );
}

export async function readableBandSourceIds(ids: string[], viewer: PostViewer) {
  const source = sql<string>`${posts.importData}->>'sourceId'`;
  const rows = await db
    .select({ source })
    .from(posts)
    .where(
      and(
        readablePost(viewer),
        sql`${posts.importData}->>'platform' = 'band'`,
        sql`${posts.importData}->>'containerId' = ${bandContainerId}`,
        inArray(source, ids),
      ),
    );
  return new Set(rows.map((row) => row.source));
}

export class ContentStorage implements ContentStorageContract {
  async getCategories(): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category || undefined;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(insertCategory).returning();
    return category;
  }

  async getPosts(
    categoryName?: string,
    limit = 50,
    offset = 0,
  ): Promise<(PublishedPost & { category: Category })[]> {
    const baseCondition = visible();
    const whereCondition =
      categoryName && categoryName !== "all"
        ? and(baseCondition, eq(categories.name, categoryName))
        : baseCondition;

    return await db
      .select(publicColumns)
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(whereCondition)
      .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`), desc(posts.id))
      .limit(limit)
      .offset(offset);
  }

  async getPost(
    id: number,
    viewer?: PostViewer,
  ): Promise<(PublishedPost & { category: Category }) | undefined> {
    const [result] = await db
      .select(publicColumns)
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(and(eq(posts.id, id), readablePost(viewer)));

    return result || undefined;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db
      .insert(posts)
      .values({
        ...insertPost,
        authorAffiliation: insertPost.authorId ? affiliationAtWriting(insertPost.authorId) : null,
        content: normalizePostDocument(insertPost.content),
      })
      .returning();
    return post;
  }

  async getPostForManagement(id: number): Promise<Post | undefined> {
    const [post] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.isPublished, true)));
    return post;
  }

  async getHiddenPosts(
    viewer: PostViewer,
    categoryName?: string,
    limit = 50,
    offset = 0,
  ): Promise<(PublishedPost & { category: Category })[]> {
    return db
      .select(publicColumns)
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(
        and(
          eq(posts.isPublished, true),
          eq(posts.isHidden, true),
          viewer.isAdmin ? undefined : eq(posts.authorId, viewer.id),
          categoryName && categoryName !== "all" ? eq(categories.name, categoryName) : undefined,
        ),
      )
      .orderBy(desc(posts.updatedAt), desc(posts.id))
      .limit(limit)
      .offset(offset);
  }

  async canReadPostAttachment(path: string, viewer: PostViewer): Promise<boolean> {
    const isBandFile = bandAttachmentPathSchema.safeParse(path).success;
    const bandParent = isBandFile
      ? and(
          eq(posts.isPublished, true),
          sql`${posts.importData}->>'platform' = 'band' AND ${posts.importData}->>'containerId' = ${bandContainerId}`,
        )
      : undefined;
    const references = await db
      .select({
        authorId: posts.authorId,
        isHidden: posts.isHidden,
        isPublished: posts.isPublished,
      })
      .from(posts)
      .where(
        and(
          bandParent,
          sql`(${path} = ANY(${posts.imageUrls}) OR jsonb_path_exists(
        ${posts.content}, '$.** ? ((@.type == "image" && @.attrs.src == $path) || (@.type == "link" && @.attrs.href == $path))',
        ${JSON.stringify({ path })}::jsonb
      ))`,
        ),
      );
    const commentReferences = await db
      .select({
        authorId: comments.authorId,
        isHidden: comments.isHidden,
        postAuthorId: posts.authorId,
        postHidden: posts.isHidden,
        postPublished: posts.isPublished,
      })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .where(
        and(
          or(
            sql`${comments.attachment}->>'objectPath' = ${path}`,
            isBandFile
              ? sql`${comments.attachment} @> ${JSON.stringify([{ objectPath: path }])}::jsonb`
              : undefined,
          ),
          bandParent,
          isBandFile ? isNotNull(comments.importSourceId) : undefined,
        ),
      );
    // A hidden comment reference is not an unattached upload.
    return (
      (!isBandFile && references.length === 0 && commentReferences.length === 0) ||
      references.some(
        (post) =>
          viewer.isAdmin || post.authorId === viewer.id || (post.isPublished && !post.isHidden),
      ) ||
      commentReferences.some(
        (comment) =>
          comment.postPublished &&
          (!comment.postHidden || viewer.isAdmin || comment.postAuthorId === viewer.id) &&
          (!comment.isHidden || viewer.isAdmin || comment.authorId === viewer.id),
      )
    );
  }

  async updatePost(id: number, authorId: string, data: UpdatePost): Promise<Post | undefined> {
    const { revision, ...editable } = data;
    const [post] = await db
      .update(posts)
      .set({
        ...editable,
        content: normalizePostDocument(data.content),
        revision: sql`${posts.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.authorId, authorId),
          eq(posts.revision, revision),
          eq(posts.isPublished, true),
          isNull(posts.eventData),
        ),
      )
      .returning();
    return post;
  }

  async deletePost(id: number, authorId: string, revision: number): Promise<boolean> {
    const rows = await db
      .delete(posts)
      .where(
        and(
          eq(posts.id, id),
          eq(posts.authorId, authorId),
          eq(posts.revision, revision),
          eq(posts.isPublished, true),
        ),
      )
      .returning({ id: posts.id });
    return rows.length === 1;
  }

  async setPostHidden(
    id: number,
    adminId: string,
    revision: number,
    isHidden: boolean,
  ): Promise<boolean> {
    const rows = await db
      .update(posts)
      .set({ isHidden, revision: sql`${posts.revision} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.isPublished, true),
          eq(posts.revision, revision),
          sql`exists (select 1 from ${users} where ${users.id} = ${adminId} and ${users.isAdmin} = true)`,
        ),
      )
      .returning({ id: posts.id });
    return rows.length === 1;
  }

  async searchPosts(query: string): Promise<(PublishedPost & { category: Category })[]> {
    const searchTerm = `%${query}%`;
    return await db
      .select(publicColumns)
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(
        and(
          visible(),
          or(like(posts.title, searchTerm), like(postBodyTextExpression(), searchTerm)),
        ),
      )
      .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.createdAt})`), desc(posts.id))
      .limit(20);
  }
}
