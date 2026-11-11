import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginModal, useAuth } from "@/features/auth";
import { PublicLayout } from "@/app/layout/public-layout";
import { publicQuickLinks } from "@/app/layout/nav-items";
import { usePublicPageSeo } from "@/lib/seo";
import { LogIn, Users } from "lucide-react";
import { SiteLogo } from "@/components/site-brand";
import { SITE_NAME } from "@shared/site";
import communityLogoSvg from "@assets/public-home/community-logo-white.svg?raw";

export function PublicHome() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();

  usePublicPageSeo(location === "/about" ? "/about" : "/");

  useScrollToTop();

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="tp-bg-brand text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16 lg:py-20 flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          <div className="flex-1 text-center lg:text-left order-2 lg:order-1">
            <div className="inline-block tp-text-accent text-xs sm:text-sm font-semibold tracking-widest mb-3">
              DGKMA · DONGGUK KOREAN MEDICINE ALUMNI
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-4">
              <span className="block">{SITE_NAME}</span>
              <span className="tp-text-accent block mt-1">홈페이지에 오신 것을 환영합니다</span>
            </h1>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
              <span className="block text-xl sm:text-2xl lg:text-3xl font-semibold text-white mb-2">
                따뜻한 연대, 함께하는 성장
              </span>
              학술·교류·후학 지원·경조사를 통해 평생 동행합니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              {user ? (
                <Button asChild size="lg" variant="onBrandOutline">
                  <Link href="/">
                    <Users size={18} /> 커뮤니티로 이동
                  </Link>
                </Button>
              ) : (
                <Button size="lg" variant="kakao" onClick={() => setLoginOpen(true)}>
                  <LogIn size={18} className="mr-2" /> 카카오로 로그인
                </Button>
              )}
              <Link href="/about/join">
                <Button size="lg" variant="onBrandOutline" className="w-full sm:w-auto">
                  회원가입 안내
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex-shrink-0 order-1 lg:order-2">
            <SiteLogo size="hero" />
          </div>
        </div>
      </section>

      {/* 회장 인사말 */}
      <section className="py-12 sm:py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <PublicHeading level="section" eyebrow="GREETING" title="회장 인사말" />
          <Card className="border-2">
            <CardContent className="p-6 sm:p-10">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="flex-1 space-y-4">
                  <p className="leading-relaxed text-gray-700">존경하는 동국 한의 동문 여러분,</p>
                  <p className="leading-relaxed text-gray-700">
                    반세기 가까이 이어온 동국 한의의 전통과 자긍심을 함께 지켜오신 동문 여러분께
                    깊이 감사드립니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    제22대 동문회는{" "}
                    <strong className="tp-text-body">‘따뜻한 연대, 함께하는 성장’</strong>을 기치로,
                    회원 상호 간의 친목과 정보 교류, 후학 양성과 학술 발전, 그리고 한의계와 사회에
                    기여하는 동문 네트워크 구축에 한 걸음씩 정진하고 있습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    동문 한 분 한 분의 마음을 잇는 따뜻한 연대 속에서, 서로의 길을 응원하며 함께
                    성장하는 동문회를 만들어 가겠습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    앞으로도 투명한 운영과 내실 있는 사업으로 자랑스러운 동국 한의의 이름에 걸맞은
                    동문회가 되도록 최선을 다하겠습니다.
                  </p>
                  <p className="leading-relaxed text-gray-700">
                    동문 여러분의 변함없는 관심과 적극적인 참여를 부탁드리며, 가정과 일터에 늘
                    건강과 평안이 함께하시기를 기원합니다.
                  </p>
                  <p className="text-right font-semibold tp-text-body mt-6">
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

      {/* 바로가기 카드 */}
      <section className="py-12 sm:py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <PublicHeading level="section" eyebrow="QUICK LINKS" title="바로가기" className="mb-10" />
          <div className="public-card-grid">
            {publicQuickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link key={q.path} href={q.path}>
                  <Card className="cursor-pointer hover:shadow-lg transition-all border-2 border-transparent h-full">
                    <CardContent className="p-6 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-lg tp-bg-accent flex items-center justify-center flex-shrink-0">
                        <Icon className="tp-text-body" size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold tp-text-body mb-1">{q.title}</h3>
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
      <section className="tp-bg-brand text-white py-12 sm:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div
            aria-hidden="true"
            className="h-16 sm:h-20 mx-auto mb-4 opacity-90 [&_svg]:h-full [&_svg]:w-auto [&_svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: communityLogoSvg }}
          />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">동문 여러분의 참여를 기다립니다</h2>
          <p className="text-white/85 mb-6 leading-relaxed">
            {user
              ? "회원 커뮤니티에서 동문 소식을 나누고 게시판과 동문 명부를 이용해 보세요."
              : "카카오 로그인 한 번이면 게시판·동문 명부·회비 납부까지 한번에 이용할 수 있습니다."}
          </p>
          {user ? (
            <Button asChild size="lg" variant="onBrandOutline">
              <Link href="/">
                <Users size={18} /> 커뮤니티로 이동
              </Link>
            </Button>
          ) : (
            <Button size="lg" variant="kakao" onClick={() => setLoginOpen(true)}>
              <LogIn size={18} className="mr-2" /> 카카오로 시작하기
            </Button>
          )}
        </div>
      </section>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} returnTo="/" />
    </PublicLayout>
  );
}

export default PublicHome;
