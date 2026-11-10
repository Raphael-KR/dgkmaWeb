import { IMAGE_UPLOAD_ACCEPT } from "@shared/contracts/uploads";
import { POST_TITLE_MAX_LENGTH } from "@shared/contracts/content-limits";
import { Suspense, useRef, type ChangeEvent } from "react";
import { Plus, ImagePlus, X, Loader2 } from "lucide-react";
import type { Category } from "@shared/contracts";
import { isRegularPostCategory } from "@shared/category-policy";
import { LazyPostBodyEditor } from "@/components/lazy-post-body-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreatePost } from "./use-create-post";

export function CreatePostDialog({
  categories,
  disabled = false,
}: {
  categories: Category[];
  disabled?: boolean;
}) {
  const {
    isOpen,
    changeOpen,
    form,
    bodyValid,
    setBodyValid,
    imageUrls,
    operation,
    busy,
    uploadImages,
    removeImage,
    submit,
  } = useCreatePost();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadImages(files);
  };

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="community" size="sm" className="shrink-0" disabled={disabled || busy}>
          <Plus size={16} className="mr-1" />
          글쓰기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto md:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>새 게시글 작성</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <fieldset
              disabled={busy}
              className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>카테고리</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                      disabled={busy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="카테고리 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.filter(isRegularPostCategory).map((category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            {category.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>제목</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="게시글 제목을 입력하세요"
                        required
                        maxLength={POST_TITLE_MAX_LENGTH}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="min-w-0 md:col-span-2">
                    <FormLabel>내용</FormLabel>
                    <Suspense
                      fallback={
                        <div
                          role="status"
                          className="min-h-48 py-8 text-center text-sm text-gray-500"
                        >
                          편집기를 불러오는 중입니다.
                        </div>
                      }
                    >
                      <FormControl>
                        <LazyPostBodyEditor
                          {...field}
                          disabled={busy}
                          onValidityChange={setBodyValid}
                        />
                      </FormControl>
                    </Suspense>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 사진 첨부 */}
              <div className="min-w-0 space-y-2 md:col-span-2">
                <FormLabel>사진 첨부</FormLabel>
                <input
                  type="file"
                  accept={IMAGE_UPLOAD_ACCEPT}
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  {operation === "upload" ? (
                    <>
                      <Loader2 size={16} className="mr-1 animate-spin" />
                      업로드중...
                    </>
                  ) : (
                    <>
                      <ImagePlus size={16} className="mr-1" />
                      사진 추가
                    </>
                  )}
                </Button>
                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                    {imageUrls.map((path) => (
                      <div key={path} className="relative">
                        <img
                          src={path}
                          alt="첨부 이미지"
                          className="w-full h-20 object-cover rounded-md border"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(path)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                          aria-label="이미지 삭제"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4 md:col-span-2">
                <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                  취소
                </Button>
                <Button variant="community" type="submit" disabled={busy || !bodyValid}>
                  {operation === "publish" ? "작성중..." : "작성완료"}
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
