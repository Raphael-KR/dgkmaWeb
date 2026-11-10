import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CategoryBadge } from "@/components/category-badge";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectoryResult, PostWithCategory } from "@shared/contracts";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Search, ArrowLeft, FileText, Users } from "lucide-react";
import { PostExcerpt } from "@/components/post-body";

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const showPosts = activeTab === "all" || activeTab === "posts";
  const showAlumni = activeTab === "all" || activeTab === "alumni";

  // 페이지 로드 시 최상단으로 스크롤
  useScrollToTop();

  // 게시글 검색
  const {
    data: posts,
    isLoading: postsLoading,
    isError: postsError,
  } = useQuery<PostWithCategory[]>({
    queryKey: ["/api/posts/search", searchTerm],
    queryFn: async ({ signal }) => {
      const response = await apiRequest(
        "GET",
        `/api/posts/search?q=${encodeURIComponent(searchTerm)}`,
        undefined,
        { signal },
      );
      return response.json();
    },
    enabled: !!searchTerm.trim() && showPosts,
  });

  // 동문 검색 (실데이터 — 본인 기수/지부 범위 제한은 서버에서 처리)
  const {
    data: alumniResult,
    isLoading: alumniLoading,
    isError: alumniError,
  } = useQuery<DirectoryResult>({
    queryKey: ["/api/alumni", searchTerm],
    queryFn: async ({ signal }) => {
      const response = await apiRequest(
        "GET",
        `/api/alumni?q=${encodeURIComponent(searchTerm)}`,
        undefined,
        { signal },
      );
      return response.json();
    },
    enabled: !!searchTerm.trim() && showAlumni,
  });

  const filteredAlumni = alumniResult?.alumni ?? [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 검색 실행 (이미 useQuery가 자동으로 실행됨)
  };

  const totalResults = (posts?.length || 0) + (filteredAlumni?.length || 0);
  const visibleResults =
    (showPosts && !postsError ? (posts?.length ?? 0) : 0) +
    (showAlumni && !alumniError ? filteredAlumni.length : 0);
  const isLoading = (showPosts && postsLoading) || (showAlumni && alumniLoading);
  const hasSearchError = (showPosts && postsError) || (showAlumni && alumniError);

  return (
    <div className="member-screen">
      <div className="member-container">
        {/* 뒤로가기 버튼 */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="mb-4 text-gray-600 hover:text-kakao-brown"
          >
            <ArrowLeft size={16} className="mr-2" />
            뒤로가기
          </Button>

          <h1 className="mb-6 text-xl font-bold text-gray-900 md:text-3xl">커뮤니티 검색</h1>

          {/* 검색 입력 */}
          <form onSubmit={handleSearch} className="mb-6 md:max-w-3xl">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <Input
                type="text"
                placeholder="게시글, 동문 이름, 기수 검색..."
                aria-label="게시글과 동문 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 text-base"
                autoFocus
              />
            </div>
          </form>

          {/* 탭 메뉴 */}
          <div className="mb-6 flex space-x-1 rounded-lg bg-gray-100 p-1 md:max-w-lg">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-white text-kakao-brown shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              전체 ({totalResults})
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "posts"
                  ? "bg-white text-kakao-brown shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              게시글 ({posts?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("alumni")}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === "alumni"
                  ? "bg-white text-kakao-brown shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              동문 ({filteredAlumni?.length || 0})
            </button>
          </div>

          {/* 검색 결과 */}
          {!!searchTerm.trim() && hasSearchError && (
            <Card className="mb-4">
              <CardContent role="alert" className="space-y-2 p-4 text-sm text-destructive">
                {showPosts && postsError && (
                  <p>게시글 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>
                )}
                {showAlumni && alumniError && (
                  <p>동문 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>
                )}
              </CardContent>
            </Card>
          )}
          {!searchTerm.trim() ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="mx-auto mb-4 text-gray-400" size={48} />
                <h3 className="text-lg font-medium text-gray-700 mb-2">검색어를 입력하세요</h3>
                <p className="text-gray-500 text-sm">
                  게시글 제목/내용, 동문 이름, 기수를 검색할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          ) : isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <LoadingSpinner size="large" variant="arc" className="mb-4" />
                <p className="text-gray-600">검색 중...</p>
              </CardContent>
            </Card>
          ) : visibleResults === 0 && !hasSearchError ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="mx-auto mb-4 text-gray-400" size={48} />
                <h3 className="text-lg font-medium text-gray-700 mb-2">검색 결과 없음</h3>
                <p className="text-gray-500 text-sm">'{searchTerm}'에 대한 검색 결과가 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="post-grid">
              {/* 게시글 결과 */}
              {showPosts &&
                !postsError &&
                posts?.map((post) => (
                  <Card
                    key={`post-${post.id}`}
                    className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setLocation(`/p/${post.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <div className="list-accent-dot"></div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <CategoryBadge category={post.category} />
                            <span className="text-xs text-gray-500">
                              {new Date(post.createdAt || "").toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="mb-1 line-clamp-2 break-words font-medium text-gray-800">
                            {post.title}
                          </h4>
                          <PostExcerpt
                            content={post.content}
                            className="line-clamp-2 text-sm text-gray-600 [overflow-wrap:anywhere]"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

              {/* 동문 결과 */}
              {showAlumni &&
                !alumniError &&
                filteredAlumni.map((person) => (
                  <Card
                    key={`alumni-${person.id}`}
                    className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setLocation("/directory")}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kakao-yellow">
                            <span className="text-kakao-brown font-bold">
                              {person.name.charAt(0)}
                            </span>
                          </div>
                          <div className="min-w-0 [overflow-wrap:anywhere]">
                            <h4 className="font-medium text-gray-800">
                              {person.name}
                              {person.position && (
                                <span className="ml-2 text-xs font-normal text-kakao-brown">
                                  {person.position}
                                </span>
                              )}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {person.generation}기 • {person.department}
                              {person.graduationYear ? ` • ${person.graduationYear}년 졸업` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {person.isMatched && (
                            <Badge className="bg-green-100 text-green-800">회원</Badge>
                          )}
                          <Users size={16} className="text-gray-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
