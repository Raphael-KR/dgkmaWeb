import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/navigation";
import { Calendar, Users, Award, Building } from "lucide-react";

export default function History() {
  const historyEvents = [
    {
      year: "1978",
      title: "동국대학교 한의과대학 개교",
      description: "동국대학교에 한의과대학이 설립되어 전통 한의학 교육의 새로운 장이 열렸습니다.",
      category: "개교",
      icon: <Building className="w-5 h-5" />
    },
    {
      year: "1982",
      title: "제1회 졸업생 배출 및 동문회 창립",
      description: "첫 졸업생 30명을 배출하며 동문회가 공식적으로 창립되었습니다.",
      category: "창립",
      icon: <Users className="w-5 h-5" />
    },
    {
      year: "1985",
      title: "정기 학술대회 시작",
      description: "동문들의 학술 교류와 발전을 위한 정기 학술대회를 시작했습니다.",
      category: "학술",
      icon: <Award className="w-5 h-5" />
    },
    {
      year: "1990",
      title: "동문회 장학금 제도 도입",
      description: "후배 양성을 위한 동문회 장학금 제도를 도입하여 매년 우수 학생들을 지원하기 시작했습니다.",
      category: "장학",
      icon: <Award className="w-5 h-5" />
    },
    {
      year: "1995",
      title: "지역 동문회 설립",
      description: "부산, 대구, 광주 등 주요 지역에 지부 동문회가 설립되어 전국적인 네트워크를 구축했습니다.",
      category: "확장",
      icon: <Users className="w-5 h-5" />
    },
    {
      year: "2000",
      title: "동문회 회칙 제정 및 체계화",
      description: "동문회 운영의 체계화를 위해 공식적인 회칙을 제정하고 조직을 정비했습니다.",
      category: "체계화",
      icon: <Building className="w-5 h-5" />
    },
    {
      year: "2005",
      title: "동문 병원 네트워크 구축",
      description: "동문들이 운영하는 한의원 및 병원 간의 네트워크를 구축하여 상호 협력 체계를 마련했습니다.",
      category: "네트워크",
      icon: <Building className="w-5 h-5" />
    },
    {
      year: "2010",
      title: "해외 동문회 설립",
      description: "미국, 캐나다 등 해외 거주 동문들을 위한 해외 동문회를 설립했습니다.",
      category: "국제화",
      icon: <Users className="w-5 h-5" />
    },
    {
      year: "2015",
      title: "사회봉사 프로그램 확대",
      description: "무료 진료, 건강 상담 등 사회봉사 활동을 체계적으로 확대했습니다.",
      category: "봉사",
      icon: <Award className="w-5 h-5" />
    },
    {
      year: "2020",
      title: "온라인 플랫폼 도입",
      description: "코로나19 대응 및 디지털 전환을 위해 온라인 모임과 디지털 서비스를 도입했습니다.",
      category: "디지털",
      icon: <Building className="w-5 h-5" />
    },
    {
      year: "2024",
      title: "카카오 싱크 통합 플랫폼 구축",
      description: "모바일 최적화 및 카카오 연동을 통한 차세대 동문회 플랫폼을 구축했습니다.",
      category: "혁신",
      icon: <Building className="w-5 h-5" />
    }
  ];

  const getCategoryColor = (category: string) => {
    const colors = {
      개교: "bg-blue-100 text-blue-800",
      창립: "bg-green-100 text-green-800", 
      학술: "bg-purple-100 text-purple-800",
      장학: "bg-yellow-100 text-yellow-800",
      확장: "bg-pink-100 text-pink-800",
      체계화: "bg-indigo-100 text-indigo-800",
      네트워크: "bg-cyan-100 text-cyan-800",
      국제화: "bg-red-100 text-red-800",
      봉사: "bg-orange-100 text-orange-800",
      디지털: "bg-teal-100 text-teal-800",
      혁신: "bg-violet-100 text-violet-800"
    };
    return colors[category as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-kakao-gray p-4">
      <Navigation />
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-2 border-kakao-yellow">
          <CardHeader className="bg-kakao-yellow">
            <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
              동문회 연혁
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-gray-700 text-center mb-8">
              1978년 한의과대학 개교부터 현재까지의 동문회 주요 역사를 소개합니다.
            </p>

            <div className="space-y-6">
              {historyEvents.map((event, index) => (
                <div key={index} className="relative">
                  {index !== historyEvents.length - 1 && (
                    <div className="absolute left-8 top-16 w-0.5 h-16 bg-kakao-yellow"></div>
                  )}
                  
                  <Card className="border border-gray-200 hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-kakao-yellow rounded-full flex items-center justify-center text-kakao-brown font-bold text-lg">
                            {event.year}
                          </div>
                        </div>
                        
                        <div className="flex-grow space-y-3">
                          <div className="flex items-center space-x-3">
                            <div className="text-kakao-brown">
                              {event.icon}
                            </div>
                            <h3 className="text-lg font-semibold text-kakao-brown">
                              {event.title}
                            </h3>
                            <Badge className={getCategoryColor(event.category)}>
                              {event.category}
                            </Badge>
                          </div>
                          
                          <p className="text-gray-700 leading-relaxed">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-blue-50 border border-blue-200">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-blue-800">46년의 역사</h4>
                  <p className="text-sm text-blue-600">1978년 개교 이래</p>
                </CardContent>
              </Card>
              
              <Card className="bg-green-50 border border-green-200">
                <CardContent className="p-4 text-center">
                  <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-green-800">3,000+ 동문</h4>
                  <p className="text-sm text-green-600">전국 및 해외 활동</p>
                </CardContent>
              </Card>
              
              <Card className="bg-purple-50 border border-purple-200">
                <CardContent className="p-4 text-center">
                  <Award className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <h4 className="font-semibold text-purple-800">지속적 발전</h4>
                  <p className="text-sm text-purple-600">한의학 발전 기여</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 bg-yellow-50 p-6 rounded-lg border border-yellow-200">
              <h3 className="font-semibold text-kakao-brown mb-3 flex items-center">
                <Award className="w-5 h-5 mr-2" />
                미래 비전
              </h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• 디지털 기술을 활용한 동문 네트워킹 강화</p>
                <p>• 국제적인 한의학 교류 및 협력 확대</p>
                <p>• 젊은 세대 동문들의 적극적인 참여 유도</p>
                <p>• 사회 공헌 활동을 통한 한의학의 사회적 가치 증진</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}