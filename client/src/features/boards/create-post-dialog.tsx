import { POST_TITLE_MAX_LENGTH } from "@shared/contracts/content-limits";
import { Suspense } from "react";
import { Plus } from "lucide-react";
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
    operation,
    busy,
    uploadEditorFiles,
    submit,
  } = useCreatePost();

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
                    <FormLabel className="sr-only">카테고리</FormLabel>
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
                    <FormLabel className="sr-only">제목</FormLabel>
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
                    <FormLabel className="sr-only">내용</FormLabel>
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
                          uploading={operation === "upload"}
                          onUploadFiles={uploadEditorFiles}
                          onValidityChange={setBodyValid}
                        />
                      </FormControl>
                    </Suspense>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
