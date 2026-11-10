import { CategoryBadge } from "@/components/category-badge";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { apiRequest } from "@/lib/queryClient";
import { PostExcerpt } from "@/components/post-body";
import type { Category, PostWithCategory } from "@shared/contracts";
import { HeartHandshake, ArrowUpRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { CreatePostDialog } from "./create-post-dialog";

export default function Boards() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState(
    () => new URLSearchParams(window.location.search).get("category") || "all",
  );
  const [showHidden, setShowHidden] = useState(
    () => new URLSearchParams(window.location.search).get("view") === "hidden",
  );

  // 페이지 로드 시 최상단으로 스크롤
  useScrollToTop();

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
    isFetching: categoriesFetching,
    refetch: refetchCategories,
  } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
  });

  const {
    data: posts,
    isLoading: postsLoading,
    isError: postsError,
    isFetching: postsFetching,
    refetch: refetchPosts,
  } = useQuery<PostWithCategory[]>({
    queryKey: [
      "/api/posts",
      selectedCategory === "all" ? undefined : selectedCategory,
      showHidden ? "hidden" : "visible",
    ],
    queryFn: async ({ signal }) => {
      const base = showHidden ? "/api/posts/hidden" : "/api/posts";
      const url =
        selectedCategory === "all"
          ? base
          : `${base}?category=${encodeURIComponent(selectedCategory)}`;
      const response = await apiRequest("GET", url, undefined, { signal });
      return response.json();
    },
    enabled: !!user,
  });

  const boardCategories = categories.some((category) => category.name === "all")
    ? categories
    : [{ name: "all", displayName: "전체" }, ...categories];
  const categoryLabel =
    boardCategories.find((category) => category.name === selectedCategory)?.displayName || "게시글";

  return (
    <div className="member-screen">
      <div className="member-container">
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 md:mb-8">
            <div>
              <h1 className="text-xl font-bold text-kakao-brown md:text-3xl">게시판</h1>
              <p className="mt-2 hidden text-sm text-gray-500 md:block">
                동문들의 소식과 이야기를 나누는 공간입니다.
              </p>
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
              <CreatePostDialog
                categories={categories}
                disabled={categoriesLoading || categoriesError}
              />
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" aria-label="게시글 표시 범위">
            <Button
              variant={showHidden ? "outline" : "default"}
              onClick={() => setShowHidden(false)}
            >
              게시된 글
            </Button>
            <Button
              variant={showHidden ? "default" : "outline"}
              onClick={() => setShowHidden(true)}
            >
              {user?.isAdmin ? "가린 글 관리" : "내 가린 글"}
            </Button>
          </div>

          {categoriesError && (
            <div className="mb-5">
              <QueryError
                message="게시판 카테고리를 불러오지 못했습니다."
                onRetry={() => void refetchCategories()}
                retrying={categoriesFetching}
              />
            </div>
          )}

          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <nav
              aria-label="게시판 카테고리"
              className="mb-5 flex gap-2 overflow-x-auto pb-2 member-sticky-panel lg:mb-0 lg:block lg:space-y-1 lg:rounded-xl lg:border lg:bg-white lg:p-3"
            >
              <h2 className="hidden px-3 py-2 text-xs font-semibold text-gray-500 lg:block">
                카테고리
              </h2>
              {boardCategories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  aria-pressed={selectedCategory === category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:w-full lg:text-left ${selectedCategory === category.name ? "bg-orange-50 text-kakao-orange" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                >
                  {category.displayName}
                </button>
              ))}
            </nav>

            <section className="min-w-0" aria-label={`${categoryLabel} 게시글`}>
              <div className="mb-4 hidden items-center justify-between md:flex">
                <h2 className="text-lg font-semibold text-gray-800">{categoryLabel}</h2>
                <span className="text-xs text-gray-500">최근 등록순</span>
              </div>
              {postsError ? (
                <QueryError
                  message="게시글을 불러오지 못했습니다."
                  onRetry={() => void refetchPosts()}
                  retrying={postsFetching}
                />
              ) : postsLoading ? (
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
                <div className="post-grid">
                  {posts?.map((post) => (
                    <Link
                      key={post.id}
                      href={`/p/${post.id}`}
                      className="group flex min-w-0 flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <CategoryBadge category={post.category} />
                        {post.isHidden && <Badge variant="secondary">가린 글</Badge>}
                        <time
                          className="text-xs text-gray-500"
                          dateTime={post.publishedAt || post.createdAt || undefined}
                        >
                          {new Date(post.publishedAt || post.createdAt || "").toLocaleDateString(
                            "ko-KR",
                          )}
                        </time>
                      </div>
                      <h3 className="mb-2 line-clamp-2 break-words font-bold text-gray-800 group-hover:text-kakao-orange md:text-lg">
                        {post.title}
                      </h3>
                      <PostExcerpt
                        content={post.content}
                        className="mb-5 line-clamp-3 text-sm text-gray-600 [overflow-wrap:anywhere]"
                      />
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
