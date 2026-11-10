import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema, type InsertPost } from "@shared/contracts";
import { emptyPostDocument } from "@shared/contracts/post-document";
import { POST_IMAGE_LIMIT } from "@shared/contracts/uploads";
import { useAuth } from "@/features/auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { trackEvent } from "@/lib/analytics";
import { postRequest, refreshPosts } from "@/lib/post-management";

type Operation = "upload" | "publish";

export function useCreatePost() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [bodyValid, setBodyValid] = useState(true);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
    setImageUrls([]);
    setBodyValid(true);
  }

  function changeOpen(open: boolean) {
    if (operationRef.current) return;
    if (!open) resetDraft();
    setIsOpen(open);
  }

  const { uploadFile } = useUpload({
    onError: (error) =>
      toast({
        title: "사진 업로드 실패",
        description: error.message,
        variant: "destructive",
      }),
  });

  async function uploadImages(files: File[]) {
    if (!files.length || operationRef.current) return;
    if (imageUrls.length + files.length > POST_IMAGE_LIMIT) {
      toast({
        title: "사진 첨부 한도 초과",
        description: `현재 ${imageUrls.length}개에 ${files.length}개를 추가하면 한도 ${POST_IMAGE_LIMIT}개를 초과합니다.`,
        variant: "destructive",
      });
      return;
    }
    if (!beginOperation("upload")) return;
    try {
      // Keep the whole batch busy, including the interval between individual PUTs.
      for (const file of files) {
        const result = await uploadFile(file);
        if (result) setImageUrls((current) => [...current, result.objectPath]);
      }
    } finally {
      finishOperation();
    }
  }

  function removeImage(path: string) {
    if (!operationRef.current) setImageUrls((current) => current.filter((value) => value !== path));
  }

  const createPost = useMutation({
    mutationFn: (data: InsertPost) => postRequest("POST", "/api/posts", data),
    onSuccess: (_post, data) => {
      trackEvent("post_published", {
        has_image: (data.imageUrls?.length ?? 0) > 0,
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
    if (!bodyValid || !user || operationRef.current) return;
    const parsed = insertPostSchema.safeParse({ ...data, authorId: user.id, imageUrls });
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
    imageUrls,
    operation,
    busy: operation !== null,
    uploadImages,
    removeImage,
    submit,
  };
}
