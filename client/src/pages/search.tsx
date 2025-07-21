import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

// import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Search, FileText, Users, Calendar, ArrowLeft } from "lucide-react";

export default function SearchPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // 게시글 검색
  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["/api/posts/search", searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const response = await fetch(`/api/posts/search?q=${encodeURIComponent(searchTerm)}`, { 
        credentials: "include" 
      });
      return response.ok ? response.json() : [];
    },
    enabled: !!searchTerm.trim() && (activeTab === "all" || activeTab === "posts"),
  });

  // 동문 검색 (모의 데이터)
  const mockAlumni = [
    { id: 1, name: "김○○", graduationYear: 2010, isVerified: true, department: "한의학과" },
    { id: 2, name: "이○○", graduationYear: 2015, isVerified: true, department: "한의학과" },
    { id: 3, name: "박○○", graduationYear: 2018, isVerified: false, department: "한의학과" },
    { id: 4, name: "최○○", graduationYear: 2020, isVerified: true, department: "한의학과" },
  ];

  const filteredAlumni = searchTerm.trim() 
    ? mockAlumni.filter(person =>
        person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.graduationYear.toString().includes(searchTerm)
      )
    : [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // 검색 실행 (이미 useQuery가 자동으로 실행됨)
  };

  const totalResults = (posts?.length || 0) + (filteredAlumni?.length || 0);
  const isLoading = postsLoading;

  return (
    <div className="min-h-screen bg-kakao-gray">
      <div className="max-w-md mx-auto px-4 pb-20 pt-6">
        {/* 뒤로가기 버튼 */}
        <div className="py-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => window.history.back()}
            className="mb-4 text-gray-600 hover:text-kakao-brown"
          >
            <ArrowLeft size={16} className="mr-2" />
            뒤로가기
          </Button>

          {/* 검색 입력 */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <Input
                type="text"
                placeholder="게시글, 동문 이름, 졸업년도 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 text-base"
                autoFocus
              />
            </div>
          </form>

          {/* 탭 메뉴 */}
          <div className="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1">
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
          {!searchTerm.trim() ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="mx-auto mb-4 text-gray-400" size={48} />
                <h3 className="text-lg font-medium text-gray-700 mb-2">검색어를 입력하세요</h3>
                <p className="text-gray-500 text-sm">
                  게시글 제목/내용, 동문 이름, 졸업년도를 검색할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          ) : isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kakao-brown mx-auto mb-4"></div>
                <p className="text-gray-600">검색 중...</p>
              </CardContent>
            </Card>
          ) : totalResults === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="mx-auto mb-4 text-gray-400" size={48} />
                <h3 className="text-lg font-medium text-gray-700 mb-2">검색 결과 없음</h3>
                <p className="text-gray-500 text-sm">
                  '{searchTerm}'에 대한 검색 결과가 없습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* 게시글 결과 */}
              {(activeTab === "all" || activeTab === "posts") && posts?.map((post: any) => (
                <Card 
                  key={`post-${post.id}`} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setLocation(`/boards?category=${post.category.name}`)}
                >
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
                        <h4 className="font-medium text-gray-800 mb-1 line-clamp-2">
                          {post.title}
                        </h4>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {post.content.substring(0, 100)}...
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* 동문 결과 */}
              {(activeTab === "all" || activeTab === "alumni") && filteredAlumni?.map((person) => (
                <Card 
                  key={`alumni-${person.id}`} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setLocation("/directory")}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-kakao-yellow rounded-full flex items-center justify-center">
                          <span className="text-kakao-brown font-bold">
                            {person.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-800">{person.name}</h4>
                          <p className="text-sm text-gray-600">
                            {person.graduationYear}년 졸업 • {person.department}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={person.isVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                          {person.isVerified ? "인증완료" : "인증대기"}
                        </Badge>
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