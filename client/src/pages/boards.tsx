import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Category } from "@shared/schema";

export default function Boards() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");

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

  const isLoading = categoriesLoading || postsLoading;

  return (
    <div className="min-h-screen bg-kakao-gray">

      
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-4">게시판</h1>
          
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-6">
              {categories.map((category: Category) => (
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
                            <Button variant="ghost" size="sm">
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
