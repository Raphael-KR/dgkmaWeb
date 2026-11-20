import type { PostDocument } from "@shared/contracts/post-document";
import type { Post } from "../../db/schema";
import type { NoticeData, NoticeType } from "@shared/contracts/notices";
export interface EventsStorageContract {
  getNoticeDraft(authorId: string, type: NoticeType): Promise<Post>;
  getOwnNotice(id: number, authorId: string): Promise<Post | undefined>;
  saveNotice(
    id: number,
    authorId: string,
    revision: number,
    data: {
      sourceText?: string;
      eventData: NoticeData;
      title: string;
      content: PostDocument;
    },
  ): Promise<Post | undefined>;
  publishNotice(id: number, authorId: string, revision: number): Promise<Post | undefined>;
  deleteNoticeDraft(id: number, authorId: string, revision: number): Promise<boolean>;
  updatePublishedNotice(
    id: number,
    authorId: string,
    revision: number,
    data: {
      eventData: NoticeData;
      title: string;
      content: PostDocument;
    },
  ): Promise<Post | undefined>;
}
