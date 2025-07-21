import { useState } from "react";

import SimpleNavigation from "@/components/simple-navigation";
import AppHeader from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";

export default function Directory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Mock alumni data
  const alumni = [
    {
      id: 1,
      name: "김○○",
      graduationYear: 2010,
      isVerified: true,
      department: "한의학과"
    },
    {
      id: 2,
      name: "이○○",
      graduationYear: 2015,
      isVerified: true,
      department: "한의학과"
    },
    {
      id: 3,
      name: "박○○",
      graduationYear: 2018,
      isVerified: false,
      department: "한의학과"
    },
  ];

  const filteredAlumni = alumni.filter(person =>
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    person.graduationYear.toString().includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-kakao-gray">
      <AppHeader onMenuClick={() => setIsMenuOpen(true)} />
      <SimpleNavigation isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
      
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-6">동문록</h1>
          
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <Input
              placeholder="이름 또는 졸업년도로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
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
                  <p className="text-sm text-gray-600">등록된 동문</p>
                  <p className="text-xl font-bold">1,247명</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alumni List */}
          <div className="space-y-3">
            {filteredAlumni.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-gray-500">검색 결과가 없습니다.</p>
                </CardContent>
              </Card>
            ) : (
              filteredAlumni.map((person) => (
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
                          <p className="font-bold">{person.name}</p>
                          <p className="text-sm text-gray-600">
                            {person.graduationYear}년 졸업 · {person.department}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={person.isVerified ? "default" : "secondary"}>
                          {person.isVerified ? "인증" : "미인증"}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          연락
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

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
