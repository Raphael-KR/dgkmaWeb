import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { useSeo } from "@/lib/seo";

export default function AboutDues() {
  useSeo({
    title: "2026년 회비 안내",
    description:
      "2026년 동국대학교한의과대학동문회 연회비·평생회비 금액과 납부 계좌, 사용 내역을 안내합니다.",
    path: "/about/dues",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">DUES</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">2026년 회비 안내</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">동문회 운영과 사업의 든든한 기반이 됩니다.</p>
        </header>

        <Card className="mb-6 border-l-4 tp-border-gold">
          <CardContent className="p-6">
            <div className="grid sm:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs tp-text-gold-dark font-semibold mb-1">연회비</div>
                <div className="text-2xl font-bold tp-text-green-dark">50,000원</div>
              </div>
              <div>
                <div className="text-xs tp-text-gold-dark font-semibold mb-1">평생회비</div>
                <div className="text-2xl font-bold tp-text-green-dark">500,000원</div>
              </div>
              <div>
                <div className="text-xs tp-text-gold-dark font-semibold mb-1">납부 기한</div>
                <div className="text-2xl font-bold tp-text-green-dark">~12월 31일</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">납부 계좌</h2>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[360px]">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark w-32">은행</td>
                    <td className="py-3 px-2 text-gray-700">국민은행</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark">계좌번호</td>
                    <td className="py-3 px-2 text-gray-700 font-mono">123-456-789012</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark">예금주</td>
                    <td className="py-3 px-2 text-gray-700">동국대학교한의과대학동문회</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">※ 입금자명에 <strong>기수+이름</strong>(예: 30회_홍길동)을 함께 적어 주세요.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">회비 사용 내역</h2>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li>• 학술·임상 강좌 운영비</li>
              <li>• 정기총회 및 친목 모임 지원</li>
              <li>• 재학생 장학금 및 후학 지원</li>
              <li>• 회원 경조사 지원</li>
              <li>• 동문회 사무 및 디지털 플랫폼 운영</li>
            </ul>
            <p className="text-xs text-gray-500 mt-4">
              자세한 결산 내역은 매년 정기총회에서 보고드립니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
