import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Navigation from "@/components/navigation";
import { Mail, Phone, MapPin } from "lucide-react";

export default function Executives() {
  const executives = [
    {
      position: "회장",
      name: "김한의",
      graduationYear: "1985년",
      hospital: "동국한방병원",
      location: "서울",
      phone: "010-1234-5678",
      email: "president@dongguk-alumni.org"
    },
    {
      position: "부회장",
      name: "이침구",
      graduationYear: "1987년",
      hospital: "서울한의원",
      location: "서울",
      phone: "010-2345-6789",
      email: "vp1@dongguk-alumni.org"
    },
    {
      position: "부회장",
      name: "박본초",
      graduationYear: "1990년",
      hospital: "부산한방클리닉",
      location: "부산",
      phone: "010-3456-7890",
      email: "vp2@dongguk-alumni.org"
    },
    {
      position: "총무",
      name: "최경락",
      graduationYear: "1992년",
      hospital: "대구한의원",
      location: "대구",
      phone: "010-4567-8901",
      email: "secretary@dongguk-alumni.org"
    },
    {
      position: "재무",
      name: "정사상",
      graduationYear: "1988년",
      hospital: "인천한방병원",
      location: "인천",
      phone: "010-5678-9012",
      email: "treasurer@dongguk-alumni.org"
    },
    {
      position: "총무부",
      name: "강맥진",
      graduationYear: "1995년",
      hospital: "광주한의원",
      location: "광주",
      phone: "010-6789-0123",
      email: "affairs@dongguk-alumni.org"
    }
  ];

  return (
    <div className="min-h-screen bg-kakao-gray p-4">
      <Navigation />
      <div className="max-w-6xl mx-auto space-y-6">
        <Card className="border-2 border-kakao-yellow">
          <CardHeader className="bg-kakao-yellow">
            <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
              동문회 임원진
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-gray-700 text-center mb-6">
              2024년도 동국대학교 한의과대학 동문회를 이끌어가는 임원진을 소개합니다.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {executives.map((executive, index) => (
                <Card key={index} className="border border-gray-200 hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center space-y-4">
                      <Avatar className="w-20 h-20">
                        <AvatarFallback className="bg-kakao-yellow text-kakao-brown font-bold text-lg">
                          {executive.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="text-center">
                        <div className="bg-kakao-brown text-white px-3 py-1 rounded-full text-sm font-semibold mb-2">
                          {executive.position}
                        </div>
                        <h3 className="font-bold text-lg text-kakao-brown">{executive.name}</h3>
                        <p className="text-sm text-gray-600">{executive.graduationYear} 졸업</p>
                      </div>
                      
                      <div className="w-full space-y-2">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <MapPin size={16} className="text-kakao-brown" />
                          <span>{executive.hospital}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <MapPin size={16} className="text-kakao-brown" />
                          <span>{executive.location}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Phone size={16} className="text-kakao-brown" />
                          <span>{executive.phone}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Mail size={16} className="text-kakao-brown" />
                          <span className="break-all">{executive.email}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="mt-8 bg-yellow-50 p-6 rounded-lg border border-yellow-200">
              <h3 className="font-semibold text-kakao-brown mb-3">임원진 연락처</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>임원진과의 연락을 원하시는 경우 위의 개별 연락처를 이용하시거나</p>
                <p>동문회 사무국 (02-2260-8900)으로 연락 주시기 바랍니다.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}