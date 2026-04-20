import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { useSeo } from "@/lib/seo";

export default function AboutBylaws() {
  useSeo({
    title: "동문회 회칙",
    description:
      "동국대학교한의과대학동문회 회칙 전문 — 회원 자격, 임원, 총회, 재정 등 전체 조항을 확인하세요.",
    path: "/about/bylaws",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">BYLAWS</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">동문회 회칙</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-500 mt-3">최근 개정: 2024년 정기총회</p>
        </header>

        <article className="tp-prose">
          <h2>제1장 총칙</h2>
          <h3>제1조 (명칭)</h3>
          <p>본회는 <strong>동국대학교한의과대학동문회</strong>(이하 "본회")라 한다.</p>
          <h3>제2조 (목적)</h3>
          <p>본회는 동문 간의 친목 도모, 학술 교류, 모교 발전 기여 및 후학 양성 지원을 통하여 한의학의 발전에 이바지함을 목적으로 한다.</p>
          <h3>제3조 (사무소)</h3>
          <p>본회의 사무소는 동국대학교 한의과대학 내에 두며, 필요시 이사회 의결로 별도 사무소를 둘 수 있다.</p>

          <h2>제2장 회원</h2>
          <h3>제4조 (회원의 자격)</h3>
          <ul>
            <li><strong>회원</strong>: 동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자로서 본 홈페이지에 가입한 사람</li>
            <li><strong>권리회원</strong>: 당해 연도 회비를 완납한 회원. 총회 의결권 · 임원 피선거권 · 권리회원 전용 혜택 등을 행사할 수 있음</li>
            <li><strong>명예회원</strong>: 회원 자격에 해당하지 않으나, 본회 발전에 현저한 공로가 있어 회장의 추천과 이사회의 승인을 받은 사람</li>
          </ul>
          <h3>제5조 (권리와 의무)</h3>
          <ol>
            <li>권리회원은 총회 의결권, 임원 선거권 및 피선거권을 가진다.</li>
            <li>모든 회원은 회칙을 준수하고 회비를 성실히 납부할 의무가 있다.</li>
          </ol>

          <h2>제3장 임원 및 조직</h2>
          <h3>제6조 (임원)</h3>
          <p>본회는 회장 1인, 부회장 약간 명, 이사 약간 명, 감사 2인을 둔다. 임원의 임기는 2년으로 하며 연임할 수 있다.</p>
          <h3>제7조 (회장)</h3>
          <p>회장은 본회를 대표하고 회무를 총괄하며, 총회와 이사회의 의장이 된다.</p>

          <h2>제4장 회의</h2>
          <h3>제8조 (총회)</h3>
          <p>정기총회는 매년 1회 개최하며, 임시총회는 회장이 필요하다고 인정하거나 이사회 또는 권리회원 1/5 이상의 요구가 있을 때 소집한다.</p>
          <h3>제9조 (의결)</h3>
          <p>총회는 출석 회원 과반수의 찬성으로 의결한다. 다만 회칙 개정은 출석 회원 2/3 이상의 찬성을 요한다.</p>

          <h2>제5장 재정</h2>
          <h3>제10조 (재원)</h3>
          <p>본회의 재정은 회원 회비, 찬조금, 기타 수입으로 충당한다.</p>
          <h3>제11조 (회계연도)</h3>
          <p>본회의 회계연도는 매년 1월 1일부터 12월 31일까지로 한다.</p>

          <h2>부칙</h2>
          <p>본 회칙에 명시되지 아니한 사항은 일반 관례에 따르며, 본 회칙은 총회의 의결로 시행한다.</p>
        </article>
      </div>
    </PublicLayout>
  );
}
