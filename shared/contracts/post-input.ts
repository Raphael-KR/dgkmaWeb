import { z } from "zod";
import { POST_TITLE_MAX_LENGTH } from "./content-limits";
import { POST_IMAGE_LIMIT } from "./uploads";

export const postTitleSchema = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(POST_TITLE_MAX_LENGTH, `제목은 ${POST_TITLE_MAX_LENGTH}자까지 입력할 수 있습니다.`);

export const postImagePathSchema = z
  .string()
  .regex(/^\/objects\/[A-Za-z0-9/_-]+$/, "잘못된 첨부 이미지 경로입니다.");

export const postImageUrlsSchema = z
  .array(postImagePathSchema)
  .max(POST_IMAGE_LIMIT, `이미지는 ${POST_IMAGE_LIMIT}개까지 첨부할 수 있습니다.`);
