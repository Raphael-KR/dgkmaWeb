import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";

export default function AboutIntro() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">ABOUT US</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">동문회 소개</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-500 mt-3">동국대학교한의과대학동문회</p>
        </header>

        <article className="tp-prose">
          <h2>설립 목적</h2>
          <p>
            동국대학교한의과대학동문회는 1985년 첫 졸업생 배출 이후, 동문 간의 친목과
            학술 교류, 모교 발전 기여, 그리고 후학 양성 지원을 목적으로 설립되었습니다.
          </p>

          <h2>연혁</h2>
          <ul>
            <li><strong>1985</strong> 동국대학교 한의과대학 첫 졸업생 배출 및 동문회 창립</li>
            <li><strong>2000</strong> 동문회 사무국 정식 개설</li>
            <li><strong>2015</strong> 창립 30주년 기념 학술대회 개최</li>
            <li><strong>2025</strong> 온라인 통합 플랫폼 출범</li>
          </ul>

          <h2>조직</h2>
          <p>
            본 동문회는 회장, 부회장, 이사회, 감사로 구성되며 임기는 2년입니다.
            주요 활동을 위해 학술위원회·재무위원회·홍보위원회·경조사위원회 등을 둡니다.
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
            동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자라면 누구나 회원으로 가입할 수 있습니다.
            가입 절차와 회비 안내는 상단 메뉴에서 확인하실 수 있습니다.
          </p>
        </article>
      </div>
    </PublicLayout>
  );
}
