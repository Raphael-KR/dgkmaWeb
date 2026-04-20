import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { useSeo } from "@/lib/seo";

export default function AboutDues() {
  useSeo({
    title: "2026년 회비 안내",
    description:
      "2026년 동국대학교한의과대학동문회 회비 금액과 납부 계좌, 권리회원 혜택을 안내합니다.",
    path: "/about/dues",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">DUES</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">2026년 회비 & 회비납부자 혜택 안내</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">
            이사회 결의에 따라, 2026년 회비와 회비납부자 혜택을 다음과 같이 공고합니다.
          </p>
        </header>

        <Card className="mb-6 border-l-4 tp-border-gold">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">2026년 동문회비</h2>
            <div className="grid sm:grid-cols-2 gap-4 text-center mb-4">
              <div className="rounded-lg bg-white p-4 border tp-border-gold/30">
                <div className="text-xs tp-text-gold-dark font-semibold mb-1">월납</div>
                <div className="text-2xl font-bold tp-text-green-dark">월 2,000원 이상</div>
              </div>
              <div className="rounded-lg bg-white p-4 border tp-border-gold/30">
                <div className="text-xs tp-text-gold-dark font-semibold mb-1">연납(일시불)</div>
                <div className="text-2xl font-bold tp-text-green-dark">연 50,000원 이상</div>
              </div>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>회비 납부 방법</strong></p>
              <ul className="space-y-1 list-disc list-inside">
                <li>월납은 1월부터 이번 달까지의 회비를 일시불로 내신 뒤, 다음 달부터 매달 10일자로 자동이체를 걸어 주세요.</li>
                <li>연납은 일시불로 5만원 이상 송금해 주시면 됩니다.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">회비 납부 계좌</h2>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[360px]">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark w-32">은행</td>
                    <td className="py-3 px-2 text-gray-700">토스뱅크 (모임통장)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark">계좌번호</td>
                    <td className="py-3 px-2 text-gray-700 font-mono">1000-9085-9464</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium tp-text-green-dark">예금주</td>
                    <td className="py-3 px-2 text-gray-700">최유행</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              ※ 송금 시 입금자명에 <strong>'졸업기수 이름 회비'</strong>(예: 16기 박종웅 회비)를 적어 주세요.
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              우리 동문회에는 사무국이나 상근 직원이 없고, 임원들이 직접 회계장부를 작성합니다. 모든 일은
              임원들이 무임금으로 봉사하고 있으니 양식 준수에 협조 부탁드립니다.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">2026년 회비 납부자(권리회원) 혜택</h2>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-2">가. 경조사(부고/혼인) 지원</h3>
              <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
                <li>범위: 본인 및 배우자 직계 1촌 이내</li>
                <li>경조사 공고를 동문회에서 올려드림 (밴드 &amp; 회원 단톡방)</li>
                <li>문자 / 화환 / 근조기 발송비 각각 <strong>5만원 감액</strong></li>
              </ul>
            </div>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-2">나. 권리회원 단톡방 초대</h3>
              <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
                <li>총회 의결권</li>
                <li>회장 선거 및 피선거권</li>
                <li>회원 간 교류</li>
                <li>각종 동문회 사업과 행사 최우선 공지</li>
                <li>동문회로의 민원 신청 최우선 반영</li>
                <li>생일 축하와 소정의 생일 선물 증정</li>
                <li>동문회 사업 참가 기회 우선 부여 (준회원에게는 특강 강사 자격을 부여하지 않음)</li>
                <li>각종 동문회 행사 &amp; 사업에서 우대</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold tp-text-green-dark mb-2">다. 동문 연락처 요청</h3>
              <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
                <li>사적이고 비영리적 목적에 한함</li>
                <li>동문회에서 연락처 공유를 개인정보주체에게 허락 받고 전달</li>
                <li>연간 10명 이상일 때는 이사회 승인 필요</li>
                <li>
                  정회원이 아닌 사람의 다른 동문 연락처 파악 요청은 원칙적으로 불허함
                  (단, 특별한 경우라고 임원이 판단하는 경우에는 회장단 승인 후 시행)
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">회비 사용 내역</h2>
            <p className="text-sm text-gray-700 mb-3">
              납부된 회비는 회칙 제4조 사업과 제22조 재정 규정에 따라 다음 용도로 집행됩니다.
            </p>
            <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
              <li>모교의 발전에 기여하는 사업</li>
              <li>한의학의 정신과 가치를 널리 알리고 발전시키는 사업</li>
              <li>공공복리 증진과 국민 건강 증대에 기여하는 사업</li>
              <li>회원 상호 간 협력과 내외 상생을 촉진하는 사업 (정기총회·친목 모임 등)</li>
              <li>회원 경조사 지원 (문자 / 화환 / 근조기 발송 등)</li>
              <li>동문회 운영 및 디지털 플랫폼 유지비</li>
            </ul>
            <p className="text-xs text-gray-500 mt-4 leading-relaxed">
              회계연도는 전년도 정기총회부터 차기 정기총회까지이며 (회칙 제23조), 매년 정기총회에서
              결산 내역을 보고드립니다. 우리 동문회에는 사무국·상근 직원이 없어 임원들이 무임금으로
              회계를 직접 담당합니다.
            </p>
          </CardContent>
        </Card>

        <div className="tp-bg-cream border tp-border-gold/40 rounded-lg p-5 text-sm text-gray-700">
          문의: <strong>010-4720-8055 (수석부회장 박종웅)</strong> 으로 톡 주시면 됩니다. 감사합니다.
        </div>
      </div>
    </PublicLayout>
  );
}
