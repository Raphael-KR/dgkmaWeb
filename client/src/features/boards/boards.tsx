import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PostExcerpt } from "@/components/post-body";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema, type Category, type InsertPost } from "@shared/contracts";
import { isSelectablePostCategory, isNoticeCategory } from "@shared/category-policy";
import { Plus, ImagePlus, X, Loader2, HeartHandshake, ArrowUpRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { Link, useLocation } from "wouter";
import { useUpload } from "@/hooks/use-upload";

const PostBodyEditor = lazy(() => import("@/components/post-body-editor").then(module => ({ default: module.PostBodyEditor })));

export default function Boards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "all");
  const [isWriteDialogOpen, setIsWriteDialogOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (error) => {
      toast({
        title: "사진 업로드 실패",
        description: error.message || "사진 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      const result = await uploadFile(file);
      if (result?.objectPath) {
        setImageUrls((prev) => [...prev, result.objectPath]);
      }
    }
  };

  const removeImage = (path: string) => {
    setImageUrls((prev) => prev.filter((p) => p !== path));
  };

  // 페이지 로드 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/posts", selectedCategory === "all" ? undefined : selectedCategory],
    queryFn: async () => {
      const url = selectedCategory === "all"
        ? "/api/posts"
        : `/api/posts?category=${encodeURIComponent(selectedCategory)}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("게시글을 불러오지 못했습니다.");
      return response.json();
    },
    enabled: !!user,
  });

  // 글쓰기 폼 설정
  const writeForm = useForm<InsertPost>({
    resolver: zodResolver(insertPostSchema.extend({
      title: insertPostSchema.shape.title,
      content: insertPostSchema.shape.content,
      categoryId: insertPostSchema.shape.categoryId,
    })),
    defaultValues: {
      title: "",
      content: "",
      categoryId: undefined,
      authorId: user?.id,
    },
  });

  // 게시글 작성 mutation
  const createPostMutation = useMutation({
    mutationFn: async (data: InsertPost) => {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (_post, variables) => {
      trackEvent("post_published", {
        has_image: imageUrls.length > 0,
        category_id: variables.categoryId ?? 0,
      });
      toast({
        title: "게시글 작성 완료",
        description: "게시글이 성공적으로 작성되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setIsWriteDialogOpen(false);
      writeForm.reset();
      setImageUrls([]);
    },
    onError: (error) => {
      toast({
        title: "게시글 작성 실패",
        description: "게시글 작성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
      console.error("Create post error:", error);
    },
  });

  const onSubmitPost = (data: InsertPost) => {
    createPostMutation.mutate({
      ...data,
      authorId: user?.id!,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
  };

  const isLoading = categoriesLoading || postsLoading;
  const boardCategories = categories.some((category) => category.name === "all")
    ? categories
    : [{ name: "all", displayName: "전체" }, ...categories];
  const categoryLabel = boardCategories.find((category) => category.name === selectedCategory)?.displayName || "게시글";

  return (
    <div className="min-h-screen bg-kakao-gray">


      <div className="member-container">
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 md:mb-8">
            <div>
              <h1 className="text-xl font-bold text-kakao-brown md:text-3xl">게시판</h1>
              <p className="mt-2 hidden text-sm text-gray-500 md:block">동문들의 소식과 이야기를 나누는 공간입니다.</p>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setLocation("/b/write/obituary")}
                aria-label="부고·경사 작성"
              >
                <HeartHandshake size={16} className="mr-1" />
                부고·경사
              </Button>

              {/* 글쓰기 버튼 */}
              <Dialog
                open={isWriteDialogOpen}
                onOpenChange={(open) => {
                  setIsWriteDialogOpen(open);
                  if (!open) {
                    setImageUrls([]);
                    writeForm.reset();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="shrink-0 bg-kakao-yellow text-kakao-brown hover:bg-yellow-400">
                    <Plus size={16} className="mr-1" />
                    글쓰기
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto md:max-w-3xl lg:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>새 게시글 작성</DialogTitle>
                </DialogHeader>

                <Form {...writeForm}>
                  <form onSubmit={writeForm.handleSubmit(onSubmitPost)} className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
                    <FormField
                      control={writeForm.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>카테고리</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="카테고리 선택" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(categories as Category[])
                                .filter((category) => isSelectablePostCategory(category) && !isNoticeCategory(category.name))
                                .map((category: Category) => (
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
                      control={writeForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem className="min-w-0">
                          <FormLabel>제목</FormLabel>
                          <FormControl>
                            <Input placeholder="게시글 제목을 입력하세요" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={writeForm.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem className="min-w-0 md:col-span-2">
                          <FormLabel>내용</FormLabel>
                          <Suspense fallback={<div role="status" className="min-h-48 py-8 text-center text-sm text-gray-500">편집기를 불러오는 중입니다.</div>}>
                            <FormControl>
                              <PostBodyEditor {...field} />
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
                        accept="image/*"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full"
                      >
                        {isUploading ? (
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsWriteDialogOpen(false);
                          setImageUrls([]);
                        }}
                      >
                        취소
                      </Button>
                      <Button
                        type="submit"
                        disabled={createPostMutation.isPending || isUploading}
                        className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400"
                      >
                        {createPostMutation.isPending ? "작성중..." : "작성완료"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <nav aria-label="게시판 카테고리" className="mb-5 flex gap-2 overflow-x-auto pb-2 member-sticky-panel lg:mb-0 lg:block lg:space-y-1 lg:rounded-xl lg:border lg:bg-white lg:p-3">
              <h2 className="hidden px-3 py-2 text-xs font-semibold text-gray-500 lg:block">카테고리</h2>
              {boardCategories.map((category) => (
                <button key={category.name} type="button" aria-pressed={selectedCategory === category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:w-full lg:text-left ${selectedCategory === category.name ? "bg-orange-50 text-kakao-orange" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
                  {category.displayName}
                </button>
              ))}
            </nav>

            <section className="min-w-0" aria-label={`${categoryLabel} 게시글`}>
              <div className="mb-4 hidden items-center justify-between md:flex">
                <h2 className="text-lg font-semibold text-gray-800">{categoryLabel}</h2>
                <span className="text-xs text-gray-500">최근 등록순</span>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : posts?.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-gray-500">게시글이 없습니다.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {posts?.map((post: any) => (
                    <Link key={post.id} href={`/p/${post.id}`} className="group flex min-w-0 flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant={post.category.badgeVariant as any}>
                          {post.category.displayName}
                        </Badge>
                        <time className="text-xs text-gray-500" dateTime={post.publishedAt || post.createdAt}>
                          {new Date(post.publishedAt || post.createdAt).toLocaleDateString("ko-KR")}
                        </time>
                      </div>
                      <h3 className="mb-2 line-clamp-2 break-words font-bold text-gray-800 group-hover:text-kakao-orange md:text-lg">
                        {post.title}
                      </h3>
                      <PostExcerpt content={post.content} className="mb-5 line-clamp-3 text-sm text-gray-600 [overflow-wrap:anywhere]" />
                      <span className="mt-auto flex items-center justify-end gap-1 text-sm font-medium text-gray-600">
                        자세히 보기 <ArrowUpRight size={16} aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>


    </div>
  );
}
