import { and, asc, eq, or, sql } from "drizzle-orm";
import { comments, posts, users } from "@shared/schema";
import { db } from "../../db";
import { affiliationAtWriting } from "./author-affiliation";
import type { PostViewer } from "./storage-contract";
import type {
  CommentChange,
  CommentChangeResult,
  CommentContent,
  CommentStorageContract,
  ReadableComment,
} from "./comment-storage-contract";

const currentAdmin = (id: string) =>
  sql<boolean>`exists (select 1 from ${users} where ${users.id} = ${id} and ${users.isAdmin} = true)`;

const commentFields = {
  id: comments.id,
  postId: comments.postId,
  parentCommentId: comments.parentCommentId,
  authorId: comments.authorId,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  isHidden: comments.isHidden,
  revision: comments.revision,
};

export class CommentStorage implements CommentStorageContract {
  async getCommentsByPost(postId: number, viewer: PostViewer) {
    const readable = or(
      eq(comments.isHidden, false),
      eq(comments.authorId, viewer.id),
      currentAdmin(viewer.id),
    );
    const rows = await db
      .select({
        ...commentFields,
        content: sql<string | null>`case when ${readable} then ${comments.content} else null end`,
        attachment: sql<
          ReadableComment["attachment"]
        >`case when ${readable} then ${comments.attachment} else null end`,
        affiliation: sql<string | null>`case when ${comments.authorId} is not null and ${readable}
          then ${comments.authorAffiliation} end`,
        authorName: sql<string | null>`case
          when ${comments.authorId} is not null then coalesce(${users.name}, '회원')
          when ${comments.importSourceId} is not null and ${readable}
            then coalesce(${comments.authorName}, '원작성자 정보 없음')
          end`,
      })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(
        and(eq(comments.postId, postId), eq(posts.isPublished, true), eq(posts.isHidden, false)),
      )
      .orderBy(asc(comments.createdAt), asc(comments.id));
    return rows.map(({ authorName, authorId, affiliation, ...comment }) => ({
      ...comment,
      isAuthor: authorId === viewer.id,
      author: authorName ? { name: authorName, affiliation } : null,
    }));
  }

  async getComment(id: number) {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async createComment(data: CommentContent & { postId: number; authorId: string }) {
    return db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(eq(posts.id, data.postId), eq(posts.isPublished, true), eq(posts.isHidden, false)),
        )
        .for("update");
      if (!parent) return undefined;
      const [comment] = await tx
        .insert(comments)
        .values({ ...data, authorAffiliation: affiliationAtWriting(data.authorId) })
        .returning({
          ...commentFields,
          content: comments.content,
          attachment: comments.attachment,
        });
      return comment;
    });
  }

  async changeComment(
    id: number,
    viewer: PostViewer,
    revision: number,
    change: CommentChange,
  ): Promise<CommentChangeResult> {
    return db.transaction(async (tx) => {
      const [reference] = await tx
        .select({ postId: comments.postId })
        .from(comments)
        .where(eq(comments.id, id));
      if (!reference) return "missing";
      // Lock the parent before its comment, as creation and cascading deletion do.
      const [parent] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.id, reference.postId),
            eq(posts.isPublished, true),
            or(eq(posts.isHidden, false), eq(posts.authorId, viewer.id), currentAdmin(viewer.id)),
          ),
        )
        .for("update");
      if (!parent) return "missing";
      const [comment] = await tx.select().from(comments).where(eq(comments.id, id)).for("update");
      if (!comment) return "missing";
      const [actor] = await tx
        .select({ isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, viewer.id));
      if (
        !actor ||
        (change.operation === "visibility" ? !actor.isAdmin : comment.authorId !== viewer.id)
      )
        return "forbidden";
      if (comment.revision !== revision) return "conflict";
      if (change.operation === "delete") {
        await tx.delete(comments).where(eq(comments.id, id));
      } else {
        await tx
          .update(comments)
          .set({
            ...(change.operation === "edit"
              ? { ...change.content, editedAt: new Date() }
              : { isHidden: change.isHidden }),
            revision: sql`${comments.revision} + 1`,
          })
          .where(eq(comments.id, id));
      }
      return "saved";
    });
  }
}
