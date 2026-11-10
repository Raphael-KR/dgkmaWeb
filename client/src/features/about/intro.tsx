import { SITE_NAME } from "@shared/site";
import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Link } from "wouter";
import { PublicLayout } from "@/app/layout/public-layout";
import { usePublicPageSeo } from "@/lib/seo";
import { currentOfficerTerm, timeline } from "@shared/heritage/content";
import { HERITAGE_PAGES, heritageEntryHref } from "@shared/heritage/navigation";

export default function AboutIntro() {
  usePublicPageSeo("/about/intro");
  useScrollToTop();
  return (
    <PublicLayout>
      <div className="public-page">
        <PublicHeading title="동문회 소개" eyebrow="ABOUT US">
          <p className="text-sm text-gray-500 mt-3">{SITE_NAME}</p>
        </PublicHeading>

        <article className="tp-prose">
          <h2>설립 목적</h2>
          <p>
            {SITE_NAME}는 1985년 설립되어 동문 간의 친목과 학술 교류, 모교 발전 기여, 그리고 후학
            양성 지원을 목적으로 설립되었습니다.
          </p>

          <h2>연혁</h2>
          <ul>
            {timeline
              .filter((entry) => entry.highlight)
              .map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.date.slice(0, 4)}</strong>{" "}
                  <Link href={heritageEntryHref(entry.id)}>{entry.title}</Link>
                  {entry.description && <p>{entry.description}</p>}
                </li>
              ))}
          </ul>
          <p>
            <Link href={HERITAGE_PAGES.timeline.path}>전체 연혁 보기 →</Link>
          </p>

          <h2>조직</h2>
          <p>
            본 동문회는 회장, 부회장, 이사회, 감사로 구성되며 임기는 2년입니다. 주요 활동을 위해
            학술위원회·재무위원회·홍보위원회·경조사위원회 등을 둡니다.
          </p>
          <p>
            <Link
              href="/about/executives"
              className="inline-flex items-center gap-1 tp-text-gold-dark font-medium hover:underline"
            >
              {currentOfficerTerm}대 임원 명단 보기 →
            </Link>
          </p>

          <h2>주요 사업</h2>
          <ul>
            <li>정기 학술대회 및 임상 강좌</li>
            <li>동문 간 친목 행사 및 지역 모임 지원</li>
            <li>모교 후학 장학사업</li>
            <li>경조사 지원 및 부고 알림</li>
            <li>회원 명부 관리 및 소통 플랫폼 운영</li>
          </ul>

          <h2>회원 가입</h2>
          <p>
            동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자라면 누구나 회원으로 가입할 수
            있습니다. 가입 절차와 회비 안내는 상단 메뉴에서 확인하실 수 있습니다.
          </p>
        </article>
      </div>
    </PublicLayout>
  );
}
