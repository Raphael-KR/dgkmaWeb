import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Link } from "wouter";
import { PublicLayout } from "@/app/layout/public-layout";
import { usePublicPageSeo } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BookOpen,
  Users2,
  GraduationCap,
  HandHeart,
  Network,
  Sparkles,
  Building2,
  Crown,
  Users,
  ShieldCheck,
  Star,
  Layers,
  ArrowRight,
} from "lucide-react";
import { SITE_NAME, SITE_SHORT_NAME } from "@shared/site";

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
  {
    icon: Layers,
    title: "이사회",
    desc: "총무 · 기획 · 홍보 · 내외협력 · 법률 · 학술 등 분야별 이사",
  },
  { icon: ShieldCheck, title: "감사", desc: "회무 및 회계 감사 — 총회에 보고" },
  { icon: Star, title: "고문 · 명예회장", desc: "자문 역할" },
  { icon: Network, title: "하부조직", desc: "기수별 동기회 · 지역지부" },
];

export default function AboutIntro() {
  usePublicPageSeo("/about/intro");
  useScrollToTop();

  return (
    <PublicLayout>
      {/* 동문회 소개 */}
      <section className="public-alt-section tp-bg-muted">
        <div className="max-w-4xl mx-auto">
          <PublicHeading eyebrow="ABOUT" title="동문회 소개" />
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <CardContent className="p-6 space-y-2">
                <div className="text-xs tp-text-emphasis font-semibold mb-2">명칭</div>
                <div>
                  <div className="text-xs text-gray-500">한글</div>
                  <div className="font-bold tp-text-body">
                    {SITE_NAME}{" "}
                    <span className="text-sm font-normal text-gray-600">
                      (약칭: {SITE_SHORT_NAME})
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">한자</div>
                  <div className="text-gray-700">
                    東國大學校韓醫科大學同門會{" "}
                    <span className="text-sm text-gray-500">(略稱: 東國韓醫同門會)</span>
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
                <div className="text-xs tp-text-emphasis font-semibold mb-3">설립 목적</div>
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="tp-text-emphasis font-bold flex-shrink-0">·</span>
                    <span>모교 발전에 기여</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-emphasis font-bold flex-shrink-0">·</span>
                    <span>한의학의 정신과 가치를 널리 알리고 발전시키는 데 기여</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-emphasis font-bold flex-shrink-0">·</span>
                    <span>공공복리 증진과 국민건강 증대에 이바지</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="tp-text-emphasis font-bold flex-shrink-0">·</span>
                    <span>
                      회원 상호 간 협력과 내외 상생을 촉진하여 동문과 본회의 사회적 기여가치 제고
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2 min-w-0">
              <CardContent className="p-6">
                <div className="text-xs tp-text-emphasis font-semibold mb-2">회원 구성</div>
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 tp-text-body">구분</th>
                        <th className="text-left py-2 px-2 tp-text-body">자격</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium align-top">회원</td>
                        <td className="py-2 px-2">
                          동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자로서 본 홈페이지에
                          가입한 사람
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium align-top">권리회원</td>
                        <td className="py-2 px-2">
                          당해 연도 회비를 완납한 회원. 총회 의결권·임원 피선거권·권리회원 전용 혜택
                          등을 행사할 수 있음
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-medium align-top">명예회원</td>
                        <td className="py-2 px-2">
                          회원 자격에 해당하지 않으나, 본회 발전에 현저한 공로가 있어 회장의 추천과
                          이사회의 승인을 받은 사람
                        </td>
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
          <PublicHeading level="section" eyebrow="PROGRAMS" title="주요 사업" className="mb-10">
            <p className="text-sm text-gray-600 mt-3">
              제22대 동문회 슬로건 —{" "}
              <strong className="tp-text-body">따뜻한 연대, 함께하는 성장</strong>
            </p>
          </PublicHeading>
          <div className="public-card-grid">
            {programs.map((p) => {
              const Icon = p.icon;
              const highlight = (p as { highlight?: boolean }).highlight;
              return (
                <Card
                  key={p.title}
                  className={`hover:shadow-lg transition-shadow border-t-4 ${
                    highlight ? "tp-border-accent tp-bg-muted" : "tp-border-accent"
                  }`}
                >
                  <CardContent className="p-6">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        highlight ? "tp-bg-accent" : "tp-bg-brand"
                      }`}
                    >
                      <Icon className={highlight ? "tp-text-body" : "text-white"} size={24} />
                    </div>
                    <h3 className="font-bold tp-text-body mb-2">{p.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 조직 및 임원 */}
      <section className="public-alt-section tp-bg-muted">
        <div className="max-w-6xl mx-auto">
          <PublicHeading
            level="section"
            eyebrow="ORGANIZATION"
            title="조직 및 임원"
            className="mb-10"
          >
            <p className="text-sm text-gray-600 mt-3">
              동문회는 총회를 최고 의결 기구로 하여 회장단·이사회·감사로 구성됩니다.
            </p>
          </PublicHeading>
          <div className="public-card-grid mb-8">
            {orgItems.map((o) => {
              const Icon = o.icon;
              return (
                <Card key={o.title}>
                  <CardContent className="p-6 flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg tp-bg-brand flex items-center justify-center flex-shrink-0">
                      <Icon className="text-white" size={22} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold tp-text-body mb-1">{o.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{o.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="text-center">
            <Link href="/about/executives">
              <Button size="lg" className="tp-bg-brand text-white hover:opacity-90 font-bold">
                <Building2 size={18} className="mr-2" />
                제22대 임원 명단 보기
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
