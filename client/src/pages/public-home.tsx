import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginModal } from "@/components/auth/login-modal";
import { PublicLayout } from "@/components/layout/public-layout";
import { useSeo } from "@/lib/seo";
import {
  BookOpen, Users2, GraduationCap, HandHeart, Network, Sparkles,
  FileText, UserPlus, Wallet, Heart, Megaphone, Info, LogIn,
  Building2, Crown, Users, ShieldCheck, Star, Layers, ArrowRight,
} from "lucide-react";
import symbolLogo from "@assets/public-home/symbol-logo.svg";
import communityLogoSvg from "@assets/public-home/community-logo-white.svg?raw";

const programs = [
  {
    icon: BookOpen,
    title: "학술 · 임상 강좌",
    desc: "실습형 임상 강좌와 학술 세미나를 운영합니다.",
  },
  {
    icon: Users2,
    title: "동문 교류 · 친목",
    desc: "연합 홈커밍데이, 총장배 골프·트레킹 대회, 동문교류회, 졸업동기회, 지역지부 모임을 지원합니다.",
  },
  {
    icon: GraduationCap,
    title: "후학 지원",
    desc: "재학생 진로·임상 특강, 동문의료기관 진료 참관, 신규 졸업생 특강과 장학 사업을 운영합니다.",
  },
  {
    icon: HandHeart,
    title: "경조사 지원",
    desc: "동문 본인 및 배우자의 직계 1촌(부모·자녀) 이내 결혼·개원·사망 경조사에 문자·화환·근조기를 지원합니다.",
  },
  {
    icon: Network,
    title: "조직 기반 강화",
    desc: "비영리민간단체 등록, 법인 회계 체계, 공식 홈페이지 운영, 정회원 혜택 확대를 추진합니다.",
  },
  {
    icon: Sparkles,
    title: "모교 발전 기금",
    desc: "권리회원 1,000명, 연 1억 원 학교 발전 기부금 조성을 목표로 합니다.",
    highlight: true,
  },
];

const orgItems = [
  { icon: Crown, title: "총회", desc: "최고 의결 기구 — 회장·총회의장·감사 선출" },
  { icon: Users, title: "회장단", desc: "회장 · 수석부회장 · 부회장" },
  { icon: Layers, title: "이사회", desc: "총무 · 기획 · 홍보 · 내외협력 · 법률 · 학술 등 분야별 이사" },
  { icon: ShieldCheck, title: "감사", desc: "회무 및 회계 감사 — 총회에 보고" },
  { icon: Star, title: "고문 · 명예회장", desc: "자문 역할" },
  { icon: Network, title: "하부조직", desc: "기수별 동기회 · 지역지부" },
];

const quickLinks = [
  { to: "/about/intro", icon: Info, title: "동문회 소개", desc: "인사말 · 연혁 · 사업 · 조직" },
  { to: "/about/bylaws", icon: FileText, title: "회칙", desc: "동문회 정관 및 규정" },
  { to: "/about/join", icon: UserPlus, title: "회원 가입", desc: "가입 안내 및 절차" },
  { to: "/about/dues", icon: Wallet, title: "2026 회비 안내", desc: "회비 납부 및 납부자 혜택" },
  { to: "/about/condolence", icon: Heart, title: "경조사 지원", desc: "문자 · 화환 · 근조기" },
  { to: "/b", icon: Megaphone, title: "공지 & 소식", desc: "동문회 최근 소식" },
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
              DGKMA · DONGGUK KOREAN MEDICINE ALUMNI
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-4">
              <span className="block">동국대학교한의과대학동문회</span>
              <span className="tp-text-gold block mt-1">홈페이지에 오신 것을 환영합니다</span>
            </h1>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
              <span className="block text-xl sm:text-2xl lg:text-3xl font-semibold text-white mb-2">
                따뜻한 연대, 함께하는 성장
              </span>
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
                <div className="flex-1 space-y-4">
                  <p className="leading-relaxed text-gray-700">
                    존경하는 동국 한의 동문 여러분,
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    반세기 가까이 이어온 동국 한의의 전통과 자긍심을 함께 지켜오신 동문 여러분께 깊이 감사드립니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    제22대 동문회는 <strong className="tp-text-green-dark">‘따뜻한 연대, 함께하는 성장’</strong>을
                    기치로, 회원 상호 간의 친목과 정보 교류, 후학 양성과 학술 발전, 그리고 한의계와 사회에 기여하는
                    동문 네트워크 구축에 한 걸음씩 정진하고 있습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    동문 한 분 한 분의 마음을 잇는 따뜻한 연대 속에서, 서로의 길을 응원하며 함께 성장하는 동문회를
                    만들어 가겠습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    앞으로도 투명한 운영과 내실 있는 사업으로 자랑스러운 동국 한의의 이름에 걸맞은 동문회가 되도록
                    최선을 다하겠습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    동문 여러분의 변함없는 관심과 적극적인 참여를 부탁드리며, 가정과 일터에 늘 건강과 평안이 함께하시기를 기원합니다.
                  </p>
                  <p className="text-right font-semibold tp-text-green-dark mt-6">
                    제22대 회장 최윤용 (졸업10기·88학번) 드림
                  </p>
                </div>
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <img
                    src="/images/executives/choi-yun-yong-president.avif"
                    alt="최윤용 회장"
                    className="w-28 sm:w-36 h-auto rounded-xl object-contain shadow-md"
                  />
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
              <CardContent className="p-6 space-y-2">
                <div className="text-xs tp-text-gold-dark font-semibold mb-2">명칭</div>
                <div>
                  <div className="text-xs text-gray-500">한글</div>
                  <div className="font-bold tp-text-green-dark">
                    동국대학교한의과대학동문회 <span className="text-sm font-normal text-gray-600">(약칭: 동국한의동문회)</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">한자</div>
                  <div className="text-gray-700">
                    東國大學校韓醫科大學同門會 <span className="text-sm text-gray-500">(略稱: 東國韓醫同門會)</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">영문</div>
                  <div className="text-gray-700 text-sm">
                    Dongguk University College of Korean Medicine Alumni Association (DGKMA)
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-xs tp-text-gold-dark font-semibold mb-3">설립 목적</div>
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="tp-text-gold-dark font-bold flex-shrink-0">·</span>
                    <span>모교 발전에 기여</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-gold-dark font-bold flex-shrink-0">·</span>
                    <span>한의학의 정신과 가치를 널리 알리고 발전시키는 데 기여</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-gold-dark font-bold flex-shrink-0">·</span>
                    <span>공공복리 증진과 국민건강 증대에 이바지</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-gold-dark font-bold flex-shrink-0">·</span>
                    <span>회원 상호 간 협력과 내외 상생을 촉진하여 동문과 본회의 사회적 기여가치 제고</span>
                  </li>
                </ul>
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
            <p className="text-sm text-gray-600 mt-3">
              제22대 동문회 슬로건 — <strong className="tp-text-green-dark">따뜻한 연대, 함께하는 성장</strong>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {programs.map((p) => {
              const Icon = p.icon;
              const highlight = (p as { highlight?: boolean }).highlight;
              return (
                <Card
                  key={p.title}
                  className={`hover:shadow-lg transition-shadow border-t-4 ${
                    highlight ? "tp-border-gold tp-bg-cream" : "tp-border-gold"
                  }`}
                >
                  <CardContent className="p-6">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        highlight ? "tp-bg-gold" : "tp-bg-green"
                      }`}
                    >
                      <Icon className={highlight ? "tp-text-green-dark" : "text-white"} size={24} />
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

      {/* 조직 및 임원 */}
      <section className="py-12 sm:py-16 px-4 tp-bg-cream border-y tp-border-gold/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">ORGANIZATION</div>
            <h2 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">조직 및 임원</h2>
            <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
            <p className="text-sm text-gray-600 mt-3">
              동문회는 총회를 최고 의결 기구로 하여 회장단·이사회·감사로 구성됩니다.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {orgItems.map((o) => {
              const Icon = o.icon;
              return (
                <Card key={o.title}>
                  <CardContent className="p-6 flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg tp-bg-green flex items-center justify-center flex-shrink-0">
                      <Icon className="text-white" size={22} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold tp-text-green-dark mb-1">{o.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{o.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="text-center">
            <Link href="/officers">
              <Button size="lg" className="tp-bg-green text-white hover:opacity-90 font-bold">
                <Building2 size={18} className="mr-2" />
                제22대 임원 명단 보기
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 바로가기 카드 */}
      <section className="py-12 sm:py-16 px-4">
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
          <div
            aria-hidden="true"
            className="h-16 sm:h-20 mx-auto mb-4 opacity-90 [&_svg]:h-full [&_svg]:w-auto [&_svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: communityLogoSvg }}
          />
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
