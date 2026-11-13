import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema, type InsertPost } from "@shared/contracts";
import { emptyPostDocument, postDocumentImagePaths } from "@shared/contracts/post-document";
import { useAuth } from "@/features/auth";
import { useToast } from "@/hooks/use-toast";
import { usePostUploads } from "./use-post-uploads";
import { trackEvent } from "@/lib/analytics";
import { postRequest, refreshPosts } from "@/lib/post-management";

type Operation = "publish";

export function useCreatePost() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [bodyValid, setBodyValid] = useState(true);
  const [operation, setOperation] = useState<Operation | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const form = useForm<InsertPost>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: { title: "", content: emptyPostDocument(), categoryId: undefined },
  });

  function beginOperation(next: Operation) {
    // The ref also blocks a second event before React commits the disabled state.
    if (operationRef.current) return false;
    operationRef.current = next;
    setOperation(next);
    return true;
  }

  function finishOperation() {
    operationRef.current = null;
    setOperation(null);
  }

  function resetDraft() {
    form.reset();
    setBodyValid(true);
  }

  function changeOpen(open: boolean) {
    if (operationRef.current || uploads.pending.current) return;
    if (!open) resetDraft();
    setIsOpen(open);
  }

  const uploads = usePostUploads(
    () => ({ content: form.getValues("content") }),
    (message) =>
      toast({
        title: "파일 업로드 실패",
        description: message,
        variant: "destructive",
      }),
  );

  async function uploadEditorFiles(files: File[]) {
    return operationRef.current ? [] : uploads.uploadFiles(files);
  }

  const createPost = useMutation({
    mutationFn: (data: InsertPost) => postRequest("POST", "/api/posts", data),
    onSuccess: (_post, data) => {
      trackEvent("post_published", {
        has_image: (data.imageUrls?.length ?? 0) + postDocumentImagePaths(data.content).length > 0,
        category_id: data.categoryId ?? 0,
      });
      toast({ title: "게시글 작성 완료", description: "게시글이 성공적으로 작성되었습니다." });
      void refreshPosts();
      resetDraft();
      setIsOpen(false);
    },
    onError: (error) => {
      toast({ title: "게시글 작성 실패", description: error.message, variant: "destructive" });
    },
    onSettled: finishOperation,
  });

  function submit(data: InsertPost) {
    if (!bodyValid || !user || operationRef.current || uploads.pending.current) return;
    const parsed = insertPostSchema.safeParse({ ...data, authorId: user.id });
    if (!parsed.success) {
      toast({
        title: "입력 내용을 확인해 주세요",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }
    if (beginOperation("publish")) createPost.mutate(parsed.data);
  }

  return {
    isOpen,
    changeOpen,
    form,
    bodyValid,
    setBodyValid,
    operation: uploads.isUploading ? "upload" : operation,
    busy: operation !== null || uploads.isUploading,
    uploadEditorFiles,
    submit,
  };
}
