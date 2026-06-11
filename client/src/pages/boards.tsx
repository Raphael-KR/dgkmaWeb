import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema, type Category, type InsertPost } from "@shared/schema";
import { Plus, ImagePlus, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useUpload } from "@/hooks/use-upload";

export default function Boards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isWriteDialogOpen, setIsWriteDialogOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: () => {
      toast({
        title: "사진 업로드 실패",
        description: "사진 업로드 중 오류가 발생했습니다.",
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

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
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
    onSuccess: () => {
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

  return (
    <div className="min-h-screen bg-kakao-gray">


      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-kakao-brown">게시판</h1>

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
                <Button size="sm" className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400">
                  <Plus size={16} className="mr-1" />
                  글쓰기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm mx-4">
                <DialogHeader>
                  <DialogTitle>새 게시글 작성</DialogTitle>
                </DialogHeader>

                <Form {...writeForm}>
                  <form onSubmit={writeForm.handleSubmit(onSubmitPost)} className="space-y-4">
                    <FormField
                      control={writeForm.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
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
                                .filter((cat: Category) => cat.name !== "all")
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
                        <FormItem>
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
                        <FormItem>
                          <FormLabel>내용</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="게시글 내용을 입력하세요"
                              className="min-h-[120px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 사진 첨부 */}
                    <div className="space-y-2">
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
                        <div className="grid grid-cols-3 gap-2">
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

                    <div className="flex justify-end space-x-2 pt-4">
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

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-6">
              {(categories as Category[]).map((category: Category) => (
                <TabsTrigger key={category.name} value={category.name} className="text-xs">
                  {category.displayName}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="space-y-4">
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
                posts?.map((post: any) => (
                  <Card key={post.id} className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-kakao-orange rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant={post.category.badgeVariant as any}>
                              {post.category.displayName}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="font-bold text-gray-800 mb-2 line-clamp-2">
                            {post.title}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                            {post.content}
                          </p>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500">
                              작성자: 관리자
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/p/${post.id}`)}
                            >
                              자세히 보기
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </Tabs>
        </div>
      </div>


    </div>
  );
}
