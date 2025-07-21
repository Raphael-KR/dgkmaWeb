import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SimpleNavigation from "@/components/simple-navigation";
import AppHeader from "@/components/app-header";

export default function About() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-kakao-gray">
      <AppHeader onMenuClick={() => setIsMenuOpen(true)} />
      <SimpleNavigation isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
      <div className="p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-2 border-kakao-yellow">
          <CardHeader className="bg-kakao-yellow">
            <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
              동국대학교 한의과대학 동문회 소개
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-kakao-brown">설립 목적</h2>
              <p className="text-gray-700 leading-relaxed">
                동국대학교 한의과대학 동문회는 동국대학교 한의과대학을 졸업한 동문들 간의 
                유대 강화와 상호 발전을 도모하며, 한의학 발전과 사회 공헌을 목적으로 설립되었습니다.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-kakao-brown">주요 활동</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>동문 간 네트워킹 및 친목 도모</li>
                <li>한의학 학술 연구 지원 및 발전 기여</li>
                <li>후배 양성을 위한 장학 사업</li>
                <li>사회 봉사 및 의료 서비스 제공</li>
                <li>동문회 소식지 발행 및 정보 공유</li>
                <li>정기 모임 및 학술 세미나 개최</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-kakao-brown">비전</h2>
              <p className="text-gray-700 leading-relaxed">
                전통 한의학과 현대 의학의 조화를 통해 인류의 건강과 복지 증진에 기여하며, 
                동문들이 자랑스러워할 수 있는 명문 동문회로 발전해 나가겠습니다.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-kakao-brown">연혁</h2>
              <div className="space-y-3">
                <div className="flex items-start space-x-4">
                  <span className="font-semibold text-kakao-brown min-w-[80px]">1978년</span>
                  <span className="text-gray-700">동국대학교 한의과대학 개교</span>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="font-semibold text-kakao-brown min-w-[80px]">1982년</span>
                  <span className="text-gray-700">제1회 졸업생 배출 및 동문회 창립</span>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="font-semibold text-kakao-brown min-w-[80px]">2000년</span>
                  <span className="text-gray-700">동문회 정관 제정 및 체계화</span>
                </div>
                <div className="flex items-start space-x-4">
                  <span className="font-semibold text-kakao-brown min-w-[80px]">2024년</span>
                  <span className="text-gray-700">디지털 플랫폼 구축 및 온라인 서비스 시작</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <h3 className="font-semibold text-kakao-brown mb-2">연락처 정보</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>주소: 서울특별시 중구 필동로1길 30 동국대학교 한의과대학</p>
                <p>전화: 02-2260-8900</p>
                <p>이메일: alumni@dongguk.edu</p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}