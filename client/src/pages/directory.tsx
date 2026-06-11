import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Info } from "lucide-react";

interface DirectoryAlumni {
  id: number;
  name: string;
  generation: string;
  department: string;
  graduationYear: number | null;
  position: string | null;
  isMatched: boolean;
}

interface DirectoryResult {
  alumni: DirectoryAlumni[];
  total: number;
  hasScope: boolean;
  scope: { generation: string | null; region: string | null };
}

export default function Directory() {
  const [searchTerm, setSearchTerm] = useState("");

  // 페이지 로드 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data, isLoading } = useQuery<DirectoryResult>({
    queryKey: ["/api/alumni"],
  });

  const alumni = data?.alumni ?? [];
  const total = data?.total ?? 0;
  const hasScope = data?.hasScope ?? false;

  const filteredAlumni = alumni.filter((person) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      person.name.toLowerCase().includes(term) ||
      person.generation.includes(searchTerm) ||
      (person.graduationYear?.toString().includes(searchTerm) ?? false)
    );
  });

  return (
    <div className="min-h-screen bg-kakao-gray">
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-2">동문록</h1>
          <p className="text-sm text-gray-500 mb-6">
            같은 기수 또는 같은 지역 동문을 볼 수 있어요.
          </p>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <Input
              placeholder="이름 또는 기수로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={!hasScope}
            />
          </div>

          {/* Statistics */}
          <Card className="shadow-sm mb-6">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">열람 가능한 동문</p>
                  <p className="text-xl font-bold">
                    {isLoading ? "—" : `${total.toLocaleString()}명`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 본문 상태별 렌더링 */}
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3 animate-pulse">
                      <div className="w-10 h-10 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-1/3" />
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !hasScope ? (
            // 기수/지역 정보가 없어 열람 범위를 정할 수 없는 경우 안내
            <Card className="shadow-sm border-yellow-200 bg-yellow-50">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Info className="text-yellow-600" size={24} />
                </div>
                <h3 className="font-bold text-gray-800 mb-2">동문을 보려면 정보가 필요해요</h3>
                <p className="text-sm text-gray-600">
                  기수 또는 활동 지역 정보가 없어 열람할 수 있는 동문을 정할 수 없습니다.
                  <br />
                  내 정보에 기수·지역을 등록하면 같은 기수·지역 동문을 볼 수 있어요.
                </p>
              </CardContent>
            </Card>
          ) : filteredAlumni.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-gray-500">
                  {searchTerm.trim()
                    ? "검색 결과가 없습니다."
                    : "열람 가능한 동문이 없습니다."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredAlumni.map((person) => (
                <Card key={person.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="font-bold text-gray-600">
                            {person.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold">
                            {person.name}
                            {person.position && (
                              <span className="ml-2 text-xs font-normal text-kakao-brown">
                                {person.position}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-600">
                            {person.generation}기 · {person.department}
                            {person.graduationYear ? ` · ${person.graduationYear}년 졸업` : ""}
                          </p>
                        </div>
                      </div>
                      {person.isMatched && (
                        <Badge variant="default">회원</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Join KakaoTalk Group */}
          <Card className="shadow-sm mt-6 bg-gradient-to-r from-yellow-50 to-yellow-100">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 kakao rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <svg className="kakao-brown" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.658-.1L5.5 21l1.072-3.85a7.55 7.55 0 0 1-1.997-5.065C4.575 6.664 9.201 3 15 3z"/>
                </svg>
              </div>
              <h3 className="font-bold text-lg mb-2">동문 카카오톡 방</h3>
              <p className="text-sm text-gray-600 mb-4">
                동문들과 실시간으로 소통하세요
              </p>
              <Button className="kakao kakao-brown font-bold">
                카카오톡 방 참여하기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
