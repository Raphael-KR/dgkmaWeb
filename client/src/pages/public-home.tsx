import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginModal } from "@/components/auth/login-modal";
import { PublicLayout } from "@/components/layout/public-layout";
import { useSeo } from "@/lib/seo";
import {
  BookOpen, Users2, GraduationCap, HandHeart, Network,
  FileText, UserPlus, Wallet, Heart, Megaphone, Info, LogIn,
} from "lucide-react";
import symbolLogo from "@assets/public-home/symbol-logo.svg";
import communityLogo from "@assets/public-home/community-logo.svg";

const programs = [
  { icon: BookOpen, title: "학술·임상강좌", desc: "정기 학술대회, 임상 강좌 및 보수교육 운영" },
  { icon: Users2, title: "교류·친목", desc: "기수별·지역별 모임, 정기총회를 통한 교류" },
  { icon: GraduationCap, title: "후학 지원", desc: "재학생 장학사업과 멘토링으로 후학을 지원" },
  { icon: HandHeart, title: "경조사 지원", desc: "회원 경조사를 함께하며 정을 나눔" },
  { icon: Network, title: "조직 기반 강화", desc: "동문 명부 관리와 디지털 플랫폼 고도화" },
];

const quickLinks = [
  { to: "/about/bylaws", icon: FileText, title: "회칙", desc: "동문회 정관 및 회칙 전문" },
  { to: "/about/join", icon: UserPlus, title: "회원가입", desc: "정회원 가입 절차 안내" },
  { to: "/about/dues", icon: Wallet, title: "2026 회비 안내", desc: "연회비 납부 방법 및 계좌" },
  { to: "/about/condolence", icon: Heart, title: "경조사 지원", desc: "지원 범위와 신청 방법" },
  { to: "/b", icon: Megaphone, title: "공지사항", desc: "로그인 후 게시판에서 확인" },
  { to: "/about/intro", icon: Info, title: "동문회 소개", desc: "동문회 연혁과 조직" },
];

export function PublicHome() {
  const [loginOpen, setLoginOpen] = useState(false);

  useSeo({
    title: "동국대학교한의과대학동문회",
    description: "모교 기여, 장학, 동문 모임, 경조사 안내",
    path: "/",
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="tp-bg-green text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 lg:py-20 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          <div className="flex-1 text-center lg:text-left order-2 lg:order-1">
            <div className="inline-block tp-text-gold text-xs sm:text-sm font-semibold tracking-widest mb-3">
              DONGGUK KOREAN MEDICINE ALUMNI
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-4">
              <span className="block">동국대학교한의과대학동문회</span>
              <span className="tp-text-gold block mt-1">홈페이지에 오신 것을 환영합니다</span>
            </h1>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
              학문적 전통과 임상 경험을 함께 나누는 동문 공동체.<br />
              학술·교류·후학 지원·경조사를 통해 평생 동행합니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button
                size="lg"
                className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400 font-bold"
                onClick={() => setLoginOpen(true)}
              >
                <LogIn size={18} className="mr-2" /> 카카오로 로그인
              </Button>
              <Link href="/about/join">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto bg-transparent border-white/40 text-white hover:bg-white/10"
                >
                  회원가입 안내
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex-shrink-0 order-1 lg:order-2">
            <div className="w-40 h-40 sm:w-52 sm:h-52 lg:w-64 lg:h-64 rounded-full bg-white/95 p-6 sm:p-8 shadow-2xl">
              <img src={symbolLogo} alt="동국대학교한의과대학동문회" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      </section>

      {/* 회장 인사말 */}
      <section className="py-12 sm:py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">GREETING</div>
            <h2 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">회장 인사말</h2>
            <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          </div>
          <Card className="border-2 tp-border-gold/30">
            <CardContent className="p-6 sm:p-10">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full tp-bg-green flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0">
                  <span className="text-white font-bold text-xl">제22대</span>
                </div>
                <div className="flex-1">
                  <p className="leading-relaxed text-gray-700 mb-4">
                    존경하는 동국대학교 한의과대학 동문 여러분, 안녕하십니까.
                  </p>
                  <p className="leading-relaxed text-gray-700 mb-4">
                    제22대 동문회장으로서 여러분과 함께 동문회의 새로운 도약을 만들어 갈 수 있게 되어
                    매우 영광스럽게 생각합니다. 우리 동문회는 학문과 임상에서 쌓은 경험을 나누고,
                    선후배가 함께 성장하는 든든한 공동체입니다.
                  </p>
                  <p className="leading-relaxed text-gray-700 mb-4">
                    앞으로 학술·임상 강좌, 후학 지원, 경조사, 디지털 기반 강화에 더욱 힘써
                    회원 모두에게 의미 있는 동문회가 되도록 하겠습니다. 많은 관심과 참여 부탁드립니다.
                  </p>
                  <p className="text-right font-semibold tp-text-green-dark mt-6">
                    제22대 동문회장 <span className="text-lg">최윤용</span> 드림
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 동문회 소개 */}
      <section className="py-12 sm:py-16 px-4 tp-bg-cream border-y tp-border-gold/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">ABOUT</div>
            <h2 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">동문회 소개</h2>
            <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="text-xs tp-text-gold-dark font-semibold mb-2">명칭</div>
                <div className="font-bold tp-text-green-dark mb-1">동국대학교한의과대학동문회</div>
                <div className="text-sm text-gray-600">(영문: Dongguk Korean Medicine Alumni Association)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-xs tp-text-gold-dark font-semibold mb-2">설립 목적</div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  동문 간의 친목 도모, 학술 교류, 모교 발전 기여 및 후학 양성 지원을 통해
                  한의학 발전에 이바지함을 목적으로 합니다.
                </p>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardContent className="p-6">
                <div className="text-xs tp-text-gold-dark font-semibold mb-2">회원 구성</div>
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="border-b tp-border-gold/40">
                        <th className="text-left py-2 px-2 tp-text-green-dark">구분</th>
                        <th className="text-left py-2 px-2 tp-text-green-dark">자격</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium align-top">회원</td>
                        <td className="py-2 px-2">동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자로서 본 홈페이지에 가입한 사람</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium align-top">권리회원</td>
                        <td className="py-2 px-2">당해 연도 회비를 완납한 회원. 총회 의결권·임원 피선거권·권리회원 전용 혜택 등을 행사할 수 있음</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-medium align-top">명예회원</td>
                        <td className="py-2 px-2">회원 자격에 해당하지 않으나, 본회 발전에 현저한 공로가 있어 회장의 추천과 이사회의 승인을 받은 사람</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 주요 사업 */}
      <section className="py-12 sm:py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">PROGRAMS</div>
            <h2 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">주요 사업</h2>
            <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {programs.map((p) => {
              const Icon = p.icon;
              return (
                <Card key={p.title} className="hover:shadow-lg transition-shadow border-t-4 tp-border-gold">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl tp-bg-green flex items-center justify-center mb-4">
                      <Icon className="text-white" size={24} />
                    </div>
                    <h3 className="font-bold tp-text-green-dark mb-2">{p.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 바로가기 카드 */}
      <section className="py-12 sm:py-16 px-4 tp-bg-cream border-t tp-border-gold/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">QUICK LINKS</div>
            <h2 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">바로가기</h2>
            <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link key={q.title + q.to} href={q.to}>
                  <Card className="cursor-pointer hover:shadow-lg hover:tp-border-gold transition-all border-2 border-transparent h-full">
                    <CardContent className="p-6 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-lg tp-bg-gold flex items-center justify-center flex-shrink-0">
                        <Icon className="tp-text-green-dark" size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold tp-text-green-dark mb-1">{q.title}</h3>
                        <p className="text-sm text-gray-600">{q.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="tp-bg-green text-white py-12 sm:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <img src={communityLogo} alt="" className="h-16 sm:h-20 mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            동문 여러분의 참여를 기다립니다
          </h2>
          <p className="text-white/85 mb-6 leading-relaxed">
            카카오 로그인 한 번이면 게시판·동문 명부·회비 납부까지 한번에 이용할 수 있습니다.
          </p>
          <Button
            size="lg"
            className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400 font-bold"
            onClick={() => setLoginOpen(true)}
          >
            <LogIn size={18} className="mr-2" /> 카카오로 시작하기
          </Button>
        </div>
      </section>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} returnTo="/" />
    </PublicLayout>
  );
}

export default PublicHome;
