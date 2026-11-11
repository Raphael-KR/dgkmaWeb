import { POST_TITLE_MAX_LENGTH } from "@shared/contracts/content-limits";
import {
  IMAGE_UPLOAD_ACCEPT,
  POST_ATTACHMENT_LIMIT,
  DOCUMENT_ATTACHMENT_LIMIT,
} from "@shared/contracts/uploads";
import { postDocumentFilePaths } from "@shared/contracts/post-document";
import { createUpdatePostSchema } from "@shared/contracts/post-management";
import { postAttachmentPaths, postTitleSchema } from "@shared/contracts/post-input";
import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Post, Category, UpdatePost } from "@shared/contracts";
import { isRegularPostCategory } from "@shared/category-policy";
import { LazyPostBodyEditor } from "@/components/lazy-post-body-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { usePostUploads } from "./use-post-uploads";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { postRequest } from "@/lib/post-management";

type PostEditFormProps = {
  post: Post;
  onSaved: () => Promise<void>;
};

export function PostEditForm({ post, onSaved }: PostEditFormProps) {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [categoryId, setCategoryId] = useState(post.categoryId);
  const [imageUrls, setImageUrls] = useState(post.imageUrls ?? []);
  const [valid, setValid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const uploads = usePostUploads(() => ({ content, imageUrls }), setError);
  const { isUploading } = uploads;

  useUnsavedChangesWarning(dirty);

  const cancel = () => {
    if (busy || uploads.pending.current) return;
    if (!dirty || window.confirm("수정 내용을 저장하지 않고 돌아갈까요?")) {
      navigate(`/p/${post.id}`);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      uploads.pending.current ||
      !valid ||
      !categoryId ||
      categoriesLoading ||
      categoriesError
    )
      return;
    const parsed = createUpdatePostSchema(post).safeParse({
      revision: post.revision,
      title,
      content,
      categoryId,
      imageUrls,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data: UpdatePost = parsed.data;
      await postRequest("PATCH", `/api/posts/${post.id}`, data);
      setDirty(false);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (busy) return;
    const paths = await uploads.uploadImages(files);
    if (paths.length) {
      setImageUrls((current) => [...current, ...paths]);
      setDirty(true);
    }
  };

  const removeImage = (path: string) => {
    if (busy || uploads.pending.current) return;
    setImageUrls((current) => current.filter((value) => value !== path));
    setDirty(true);
  };

  return (
    <form onSubmit={save} className="space-y-5 member-panel">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {(!postTitleSchema.safeParse(post.title).success ||
        postAttachmentPaths(post).length > POST_ATTACHMENT_LIMIT ||
        postDocumentFilePaths(post.content).length > DOCUMENT_ATTACHMENT_LIMIT) && (
        <p className="text-sm text-gray-600">
          기존 제목·첨부를 유지하거나 첨부를 줄여 저장할 수 있습니다. 제목을 바꾸거나 첨부를 추가할
          때는 제목 {POST_TITLE_MAX_LENGTH}자·일반 파일 {DOCUMENT_ATTACHMENT_LIMIT}개·이미지와 파일
          합계 {POST_ATTACHMENT_LIMIT}개 제한이 적용됩니다.
        </p>
      )}
      {categoriesError && (
        <QueryError
          message="게시판 카테고리를 불러오지 못했습니다. 입력한 수정 내용은 유지됩니다."
          onRetry={() => void refetchCategories()}
          retrying={categoriesFetching}
        />
      )}
      <fieldset disabled={busy || isUploading} className="space-y-5">
        <label className="block space-y-2">
          <span>카테고리</span>
          <select
            className="block w-full rounded-md border p-2"
            value={categoryId ?? ""}
            disabled={categoriesLoading || categoriesError}
            required
            onChange={(event) => {
              setCategoryId(Number(event.target.value));
              setDirty(true);
            }}
          >
            <option value="" disabled>
              카테고리 선택
            </option>
            {categories.filter(isRegularPostCategory).map((category) => (
              <option key={category.id} value={category.id}>
                {category.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>제목</span>
          <Input
            required={title !== post.title}
            maxLength={Math.max(POST_TITLE_MAX_LENGTH, post.title.length)}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
          />
        </label>
        <div className="space-y-2">
          <p>본문</p>
          <Suspense fallback={<LoadingSpinner />}>
            <LazyPostBodyEditor
              value={content}
              disabled={busy || isUploading}
              onUploadFiles={uploads.uploadFiles}
              onChange={(value) => {
                setContent(value);
                setDirty(true);
              }}
              onValidityChange={(value) => {
                setValid(value);
                if (!value) setDirty(true);
              }}
            />
          </Suspense>
        </div>
        <label className="block space-y-2">
          <span>첨부 이미지</span>
          <Input type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple onChange={handleFileSelect} />
        </label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {imageUrls.map((path) => (
            <div key={path} className="space-y-2">
              <img src={path} alt="첨부 이미지" className="h-32 w-full rounded-md object-cover" />
              <Button type="button" variant="outline" size="sm" onClick={() => removeImage(path)}>
                첨부 해제
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel}>
            취소
          </Button>
          <Button
            type="submit"
            disabled={!valid || !categoryId || categoriesLoading || categoriesError}
          >
            {busy ? "저장 중…" : "수정 저장"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
