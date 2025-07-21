import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import SimpleNavigation from "@/components/simple-navigation";
import AppHeader from "@/components/app-header";
import { 
  Mail, Phone, MapPin, Calendar, Users, Award, Building,
  Info, UserCheck, History, FileText, ChevronRight 
} from "lucide-react";

export default function InfoPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("about");

  const sections = [
    { id: "about", label: "동문회소개", icon: <Info size={20} /> },
    { id: "executives", label: "임원진", icon: <UserCheck size={20} /> },
    { id: "history", label: "연혁", icon: <History size={20} /> },
    { id: "bylaws", label: "회칙", icon: <FileText size={20} /> }
  ];

  // 임원진 데이터
  const executives = [
    {
      position: "회장",
      name: "김한의",
      graduationYear: "1985년",
      hospital: "서울한방병원",
      location: "서울",
      phone: "010-1234-5678",
      email: "president@dongguk-alumni.org"
    },
    {
      position: "부회장",
      name: "이침구",
      graduationYear: "1987년",
      hospital: "부산한의원",
      location: "부산",
      phone: "010-2345-6789",
      email: "vicepresident@dongguk-alumni.org"
    },
    {
      position: "총무",
      name: "박처방",
      graduationYear: "1990년",
      hospital: "대구한방클리닉",
      location: "대구",
      phone: "010-3456-7890",
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

  // 연혁 데이터
  const historyEvents = [
    {
      year: "1978",
      title: "한의과대학 개교",
      description: "동국대학교 한의과대학이 설립되어 한의학 교육의 새로운 장을 열었습니다.",
      category: "개교",
      icon: <Building className="w-6 h-6" />
    },
    {
      year: "1982",
      title: "동문회 창립",
      description: "제1회 졸업생 배출과 함께 동국대학교 한의과대학 동문회가 정식으로 창립되었습니다.",
      category: "창립",
      icon: <Users className="w-6 h-6" />
    },
    {
      year: "1990",
      title: "학술연구회 설립",
      description: "동문들의 학술 교류와 연구 활동을 위한 학술연구회가 설립되었습니다.",
      category: "학술",
      icon: <Award className="w-6 h-6" />
    },
    {
      year: "1995",
      title: "장학재단 설립",
      description: "후배 양성을 위한 장학재단을 설립하여 교육 지원 사업을 시작했습니다.",
      category: "장학",
      icon: <Award className="w-6 h-6" />
    },
    {
      year: "2000",
      title: "회칙 제정",
      description: "동문회 운영의 체계화를 위해 정식 회칙을 제정하고 조직을 정비했습니다.",
      category: "체계화",
      icon: <FileText className="w-6 h-6" />
    },
    {
      year: "2005",
      title: "지역 동문회 확대",
      description: "전국 각지에 지역별 동문회를 설립하여 네트워크를 확장했습니다.",
      category: "확장",
      icon: <MapPin className="w-6 h-6" />
    },
    {
      year: "2010",
      title: "온라인 네트워크 구축",
      description: "인터넷 기반의 동문 네트워크 시스템을 도입하여 소통을 활성화했습니다.",
      category: "네트워크",
      icon: <Users className="w-6 h-6" />
    },
    {
      year: "2015",
      title: "국제교류 확대",
      description: "해외 동문 및 국제 한의학 기관과의 교류 협력을 확대했습니다.",
      category: "국제화",
      icon: <Building className="w-6 h-6" />
    },
    {
      year: "2020",
      title: "사회공헌 활동 확대",
      description: "코로나19 대응 및 사회 봉사 활동을 대폭 확대하여 사회적 책임을 다했습니다.",
      category: "봉사",
      icon: <Award className="w-6 h-6" />
    },
    {
      year: "2024",
      title: "디지털 플랫폼 구축",
      description: "모바일 친화적인 디지털 플랫폼을 구축하여 차세대 동문 서비스를 시작했습니다.",
      category: "디지털",
      icon: <Building className="w-6 h-6" />
    }
  ];

  // 회칙 데이터
  const bylawSections = [
    {
      chapter: "제1장",
      title: "총칙",
      articles: [
        {
          article: "제1조",
          title: "목적",
          content: "본 회는 동국대학교 한의과대학 졸업생들의 상호 친목을 도모하고 모교 발전에 기여함을 목적으로 한다."
        },
        {
          article: "제2조",
          title: "명칭",
          content: "본 회의 명칭은 '동국대학교 한의과대학 동문회'라 한다."
        },
        {
          article: "제3조",
          title: "소재지",
          content: "본 회의 사무소는 서울특별시 중구 필동로1길 30 동국대학교 한의과대학 내에 둔다."
        }
      ]
    },
    {
      chapter: "제2장",
      title: "회원",
      articles: [
        {
          article: "제4조",
          title: "회원의 자격",
          content: "본 회의 회원은 동국대학교 한의과대학을 졸업한 자로 한다."
        },
        {
          article: "제5조",
          title: "회원의 권리와 의무",
          content: "회원은 본 회의 모든 활동에 참여할 권리를 가지며, 회칙을 준수하고 회비를 납부할 의무를 진다."
        }
      ]
    },
    {
      chapter: "제3장",
      title: "조직",
      articles: [
        {
          article: "제6조",
          title: "기구",
          content: "본 회는 총회, 이사회, 감사로 구성한다."
        },
        {
          article: "제7조",
          title: "총회",
          content: "총회는 본 회의 최고 의결기관으로서 모든 회원으로 구성한다."
        },
        {
          article: "제8조",
          title: "이사회",
          content: "이사회는 회장, 부회장, 총무, 재무, 각 기수별 대표로 구성한다."
        }
      ]
    },
    {
      chapter: "제4장",
      title: "임원",
      articles: [
        {
          article: "제9조",
          title: "임원의 종류",
          content: "본 회의 임원은 회장 1명, 부회장 2명, 총무 1명, 재무 1명, 감사 2명을 둔다."
        },
        {
          article: "제10조",
          title: "임원의 임기",
          content: "임원의 임기는 2년으로 하되, 연임할 수 있다."
        },
        {
          article: "제11조",
          title: "회장의 직무",
          content: "회장은 본 회를 대표하고 회무를 통괄한다."
        }
      ]
    },
    {
      chapter: "제5장",
      title: "회의",
      articles: [
        {
          article: "제12조",
          title: "정기총회",
          content: "정기총회는 매년 1회 개최한다."
        },
        {
          article: "제13조",
          title: "임시총회",
          content: "임시총회는 회장이 필요하다고 인정할 때 또는 재적회원 3분의 1 이상의 요구가 있을 때 개최한다."
        },
        {
          article: "제14조",
          title: "의결정족수",
          content: "총회의 의사는 재적회원 과반수의 출석으로 개의하고, 출석회원 과반수의 찬성으로 의결한다."
        },
        {
          article: "제15조",
          title: "재정",
          content: "본 회의 재정은 회비, 찬조금, 기타 수입으로 충당한다."
        }
      ]
    },
    {
      chapter: "제6장",
      title: "보칙",
      articles: [
        {
          article: "제16조",
          title: "회칙 개정",
          content: "본 회칙은 총회에서 재적회원 3분의 2 이상의 찬성으로 개정할 수 있다."
        },
        {
          article: "제17조",
          title: "시행일",
          content: "본 회칙은 2000년 3월 1일부터 시행한다."
        }
      ]
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

  const renderAboutSection = () => (
    <div className="space-y-6">
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
  );

  const renderExecutivesSection = () => (
    <div className="space-y-6">
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
  );

  const renderHistorySection = () => (
    <div className="space-y-6">
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
  );

  const renderBylawsSection = () => (
    <div className="space-y-6">
      <Card className="border-2 border-kakao-yellow">
        <CardHeader className="bg-kakao-yellow">
          <CardTitle className="text-2xl font-bold text-kakao-brown text-center">
            동국대학교 한의과대학 동문회 회칙
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm text-gray-600 text-center">
              본 회칙은 2000년 3월 1일 제정되어 2024년 현재까지 시행되고 있습니다.
            </p>
          </div>

          <div className="space-y-8">
            {bylawSections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="space-y-4">
                <div className="bg-kakao-brown text-white p-3 rounded-lg">
                  <h2 className="text-xl font-bold text-center">
                    {section.chapter} {section.title}
                  </h2>
                </div>
                
                <div className="space-y-4">
                  {section.articles.map((article, articleIndex) => (
                    <Card key={articleIndex} className="border border-gray-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-kakao-brown">
                          {article.article} ({article.title})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="text-gray-700 whitespace-pre-line leading-relaxed">
                          {article.content}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {sectionIndex < bylawSections.length - 1 && (
                  <Separator className="my-6" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-kakao-brown mb-3">부칙</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>1. 본 회칙에 명시되지 않은 사항은 총회의 결의에 따른다.</p>
              <p>2. 본 회칙의 해석에 관하여 의견이 다를 때는 이사회의 결정에 따른다.</p>
              <p>3. 본 회칙은 동문회 홈페이지를 통해 공개하며, 회원은 언제든지 열람할 수 있다.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "about":
        return renderAboutSection();
      case "executives":
        return renderExecutivesSection();
      case "history":
        return renderHistorySection();
      case "bylaws":
        return renderBylawsSection();
      default:
        return renderAboutSection();
    }
  };

  return (
    <div className="min-h-screen bg-kakao-gray">
      <AppHeader onMenuClick={() => setIsMenuOpen(true)} />
      <SimpleNavigation isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
      
      <div className="p-4">
        {/* 섹션 네비게이션 */}
        <div className="max-w-4xl mx-auto mb-6">
          <Card className="border border-gray-200">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {sections.map((section) => (
                  <Button
                    key={section.id}
                    variant={activeSection === section.id ? "default" : "ghost"}
                    className={`flex items-center justify-center space-x-2 p-3 ${
                      activeSection === section.id 
                        ? "bg-kakao-yellow text-kakao-brown hover:bg-kakao-yellow/90" 
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.icon}
                    <span className="text-sm font-medium">{section.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 컨텐츠 영역 */}
        <div className="max-w-4xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}