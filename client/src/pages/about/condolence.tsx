import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { useSeo } from "@/lib/seo";

export default function AboutCondolence() {
  useSeo({
    title: "회원 경조사 지원 안내(문자/화환/근조기)",
    description:
      "동국대학교한의과대학동문회의 경조사 문자·화환·근조기 신청 절차와 부담금, 입금 계좌, FAQ를 안내합니다.",
    path: "/about/condolence",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">CONDOLENCE</div>
          <h1 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">
            회원 경조사 지원 안내 (문자 / 화환 / 근조기)
          </h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">회원과 가족의 경조사를 동문회가 함께합니다.</p>
        </header>

        {/* 지원 범위·금액 한눈에 보기 */}
        <Card className="mb-6 border-l-4 tp-border-gold">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">지원 항목별 금액 (한눈에 보기)</h2>
            <p className="text-sm text-gray-700 mb-3">
              지원 대상: 회원 본인 및 <strong>본인·배우자의 직계 1촌(부모·자녀)</strong> 이내 경조사.
              회칙 제25조에 따른 길흉사(결혼·개원·사망)에 적용됩니다.
            </p>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b tp-border-gold/40">
                    <th className="text-left py-2 px-2 tp-text-green-dark">구분</th>
                    <th className="text-left py-2 px-2 tp-text-green-dark">기본 부담금</th>
                    <th className="text-left py-2 px-2 tp-text-green-dark">회비 납부자 감액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  <tr>
                    <td className="py-3 px-2 font-medium">단문 문자 (한글 45자 이하)</td>
                    <td className="py-3 px-2">5만원</td>
                    <td className="py-3 px-2">5만원 감액 → <strong>무료</strong></td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">장문 문자 (한글 45자 초과)</td>
                    <td className="py-3 px-2">15만원</td>
                    <td className="py-3 px-2">5만원 감액 → 10만원</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">근조기</td>
                    <td className="py-3 px-2">10만원</td>
                    <td className="py-3 px-2">5만원 감액 → 5만원</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">화환</td>
                    <td className="py-3 px-2">13만원</td>
                    <td className="py-3 px-2">5만원 감액 → 8만원</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              ※ 본인상은 회비 납부 여부와 관계없이 5만원 감액 적용. 지출증빙(계산서) 필요 시 10% 추가 송금.
            </p>
          </CardContent>
        </Card>

        {/* 가. 경조사 문자 신청 */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">가. 경조사 문자 신청 방법</h2>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-1">0단계. 동문회 밴드 가입</h3>
              <p className="text-sm text-gray-700">
                <a
                  href="https://band.us/@dkom"
                  target="_blank"
                  rel="noreferrer"
                  className="tp-text-gold-dark underline"
                >
                  https://band.us/@dkom
                </a>
              </p>
            </div>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-2">1단계. 부고 등록</h3>
              <p className="text-sm text-gray-700 mb-2">
                동문회비 납부자는 동문회에서 대신 올려드립니다. 동문회 밴드에 다음 양식으로 올려 주세요.
              </p>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-md p-4 whitespace-pre-wrap leading-relaxed text-gray-800">{`-- 동문회 밴드에 부고를 아래 양식으로 올려주세요 --
동국한의 졸업OO기(OO학번) 김OO 동문의 부친께서
OOOO년 O월 O일 별세하셨기에 삼가 알려드립니다.

- 고인: 김OO (향년 OO세)
- 빈소: OO병원 장례식장 A102호
- 발인: OOOO년 O월 O일(O요일)
- 연락처: 김OO 010-OOOO-OOOO
- 마음 전하실 곳: OO은행 OO-OOO-OOOO 홍OO
* 유가족 및 장례식장 위치 확인: https://OOOO.com/OOO`}</pre>
            </div>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-2">2단계. 비용 입금</h3>
              <p className="text-sm font-medium text-gray-800 mb-1">[경조사 문자 발송요청자 부담금]</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 mb-3">
                <li>단문 5만원, 장문(한글 45자 초과) 15만원</li>
                <li>
                  동문회비 납부자(본인과 배우자의 직계 1촌까지)와 본인상은 <strong>5만원 감액</strong>
                </li>
              </ul>
              <p className="text-sm font-medium text-gray-800 mb-1">[경조사 문자 비용 입금 계좌]</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>
                  <strong>기업 085-110653-04-017 동국대학교한의과대학동문회</strong>
                </li>
                <li>지출증빙(계산서) 필요 시 10% 추가 송금</li>
                <li>
                  송금 시 <strong>'졸업기수 이름 문자비용'</strong>(예: 16기 박종웅 문자비용)으로 적어
                  보내주세요.
                </li>
                <li>
                  ※ 경조사 문자 외에 다른 송금액(회비, 근조기 등)과 합쳐서 보내지 마시고 항목별로 따로
                  보내주세요. 임원들이 직접 회계장부를 작성하므로 협조 부탁드립니다.
                </li>
              </ul>
            </div>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-1">3단계. 발송 요청</h3>
              <p className="text-sm text-gray-700">
                동문회 카톡{" "}
                <a
                  href="https://bit.ly/duckma"
                  target="_blank"
                  rel="noreferrer"
                  className="tp-text-gold-dark underline"
                >
                  https://bit.ly/duckma
                </a>
                {" "}으로 문자 발송을 요청합니다.
              </p>
            </div>

            <div>
              <h3 className="font-semibold tp-text-green-dark mb-1">4단계. 발송 승인</h3>
              <p className="text-sm text-gray-700">
                동문회 카톡으로 보내드리는 '발송 문구 시안'을 검토 후, 발송 승인을 합니다.
                (발송 승인을 거쳐서 나간 문자 내용에 대해 동문회는 책임을 지지 않습니다.)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 나. 화환/근조기 신청 */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">나. 화환 / 근조기 신청 방법</h2>

            <div className="mb-5">
              <h3 className="font-semibold tp-text-green-dark mb-2">1단계. 비용 입금</h3>
              <p className="text-sm font-medium text-gray-800 mb-1">[화환/근조기 발송요청자 부담금]</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1 mb-3">
                <li>근조기 10만원 / 화환 13만원</li>
                <li>
                  동문회비 납부자(본인과 배우자의 직계 1촌까지)와 본인상은 <strong>5만원 감액</strong>
                </li>
              </ul>
              <p className="text-sm font-medium text-gray-800 mb-1">[화환/근조기 비용 입금 계좌]</p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>
                  <strong>기업 085-110653-04-017 동국대학교한의과대학동문회</strong>
                </li>
                <li>지출증빙(계산서) 필요 시 10% 추가 송금</li>
                <li>
                  송금 시 <strong>'졸업기수 이름 항목'</strong>(예: 16기 박종웅 근조기)으로 적어
                  보내주세요.
                </li>
                <li>
                  ※ 화환/근조기 비용을 다른 송금액과 합쳐서 보내지 마시고 항목별로 따로 보내주세요.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold tp-text-green-dark mb-1">2단계. 발송 요청</h3>
              <p className="text-sm text-gray-700">
                동문회 카톡{" "}
                <a
                  href="http://pf.kakao.com/_fPxgxeG/chat"
                  target="_blank"
                  rel="noreferrer"
                  className="tp-text-gold-dark underline break-all"
                >
                  pf.kakao.com/_fPxgxeG/chat
                </a>
                {" "}으로 발송을 요청합니다.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 다. FAQ */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">다. 경조사 문자 FAQ</h2>
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-outside ml-5">
              <li>
                경조사 문자는 단문은 정회원(본인과 배우자의 직계 1촌까지)과 본인상은 무료, 준회원 5만원,
                장문(한글 45자 초과)은 정회원 10만원, 준회원 15만원을 받고 발송합니다.
                <ul className="mt-1 list-disc list-inside text-gray-600">
                  <li>동문 전체 문자는 단문 약 3만원, 장문 약 9만원의 실비가 발생합니다.</li>
                </ul>
              </li>
              <li>
                부고 문자는 밴드에 올라온 부고문 링크를 단축주소로 변환하여 첨부합니다. 커뮤니티 활성화를
                위하여 밴드 링크 외에 다른 URL은 첨부하지 않습니다.
              </li>
              <li>단문으로 보낼지 장문으로 보낼지는 문자 발송 요청자의 뜻에 따릅니다.</li>
              <li>
                문자 발송 요청자는 발송 문구 시안을 검토 후 발송 승인을 해 주셔야 문자가 발송됩니다.
                (발송 승인을 거쳐서 나간 문자 내용에 대해 동문회는 책임을 지지 않습니다.)
              </li>
              <li>
                동국한의 동문회 문자를 받기 원하지 않으시면 졸업기수, 입학학번, 성함과 함께 문자 거부
                의사를 문자메시지로 주시면 조치해 드리겠습니다.
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="tp-bg-cream border tp-border-gold/40 rounded-lg p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Heart className="text-red-600" size={20} />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            동문 여러분의 기쁨과 슬픔에 항상 함께하겠습니다. 자세한 사항은 동문회 카톡으로 문의해 주세요.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
