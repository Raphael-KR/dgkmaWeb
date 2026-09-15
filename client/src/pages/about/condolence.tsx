import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useSeo } from "@/lib/seo";

const account = "기업 085-110653-04-017 동국대학교한의과대학동문회";

export default function AboutCondolence() {
  useSeo({
    title: "회원 경조사 지원 안내(문자/화환/근조기)",
    description:
      "동국대학교한의과대학동문회 권리회원의 경조사 문자·화환·근조기 신청 절차와 비용을 안내합니다.",
    path: "/about/condolence",
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">CONDOLENCE</div>
          <h1 className="text-2xl sm:text-3xl font-bold tp-text-green-dark">
            회원 경조사 신청 안내
          </h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">문자 · 화환 · 근조기 신청 절차를 안내합니다.</p>
        </header>

        <Card className="mb-6 border-l-4 tp-border-gold">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">신청 대상</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              경조사 문자·화환·근조기는 <strong>권리회원(회비 납부자)만 신청</strong>할 수 있습니다.
              다만 본인상 또는 회장단이 예외로 결정한 경우에는 신청할 수 있습니다.
            </p>
            <p className="text-xs text-gray-500 mt-3">2026년 9월 1일 시행</p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">신청 절차</h2>

            <ol className="space-y-6">
              <li>
                <h3 className="font-semibold tp-text-green-dark mb-2">1단계. 동문회 밴드 가입</h3>
                <a
                  href="https://band.us/@dkom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm tp-text-gold-dark underline underline-offset-2"
                  onClick={() => trackEvent("external_contact_clicked", {
                    destination: "band",
                    source: "condolence",
                  })}
                >
                  동문회 밴드 가입하기
                </a>
              </li>

              <li>
                <h3 className="font-semibold tp-text-green-dark mb-2">2단계. 동문회비 납부</h3>
                <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
                  <p><strong>{account}</strong></p>
                  <p>회비: <strong>5만원</strong></p>
                  <p>
                    입금자명: <strong>졸업기수+이름+회비</strong>
                    <span className="text-gray-500"> (예: 00기홍길동회비)</span>
                  </p>
                </div>
              </li>

              <li>
                <h3 className="font-semibold tp-text-green-dark mb-2">3단계. 신청 항목 비용 입금</h3>
                <div className="overflow-x-auto -mx-2 px-2 mb-4">
                  <table className="w-full text-sm min-w-[360px]">
                    <thead>
                      <tr className="border-b tp-border-gold/40 text-left">
                        <th className="py-3 px-2 font-semibold tp-text-green-dark">항목</th>
                        <th className="py-3 px-2 font-semibold tp-text-green-dark">비용</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      <tr>
                        <td className="py-3 px-2 font-medium">문자(장문)</td>
                        <td className="py-3 px-2">10만원</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">근조기</td>
                        <td className="py-3 px-2">5만원</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-2 font-medium">화환</td>
                        <td className="py-3 px-2">8만원</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
                  <p><strong>{account}</strong></p>
                  <p>
                    입금자명: <strong>졸업기수+이름+신청항목</strong>
                    <span className="text-gray-500"> (예: 00기홍길동문자)</span>
                  </p>
                </div>
              </li>

              <li>
                <h3 className="font-semibold tp-text-green-dark mb-2">4단계. 홈페이지 게시 및 발송 요청</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  경조사 내용을{" "}
                  <a
                    href="https://buly.kr/AF2yVzW"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold tp-text-gold-dark underline underline-offset-2"
                    onClick={() => trackEvent("external_contact_clicked", {
                      destination: "kakao",
                      source: "condolence",
                    })}
                  >
                    수석부회장 박종웅에게 카카오톡으로 전달
                  </a>
                  하고 문자·화환·근조기 발송을 요청해 주세요.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-outside ml-5">
                  <li>권리회원의 경조사는 동문회 커뮤니티와 권리회원 단톡방에 알려드립니다.</li>
                  <li>권리회원이 아닌 동문의 경조사는 본인이 직접 커뮤니티에 올려 주세요.</li>
                </ul>
              </li>

              <li>
                <h3 className="font-semibold tp-text-green-dark mb-2">5단계. 문자 발송 승인</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  문자를 신청한 경우 카카오톡으로 전달받은 <strong>발송 문구 시안</strong>을 검토하고
                  발송을 승인해 주세요. 승인을 거쳐 발송된 문자 내용에 대해서는 동문회가 책임지지 않습니다.
                </p>
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 leading-relaxed">
          <strong className="block mb-1">입금 시 꼭 확인해 주세요</strong>
          회비와 문자(장문)·근조기·화환 비용은 합치지 말고 각각 따로 보내 주세요. 동문회에는 사무국이나
          상근 직원이 없으며, 임원들이 무임금으로 봉사하며 회계장부를 직접 작성하고 있습니다.
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">FAQ</h2>
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-outside ml-5">
              <li>졸업생 전체 문자는 단문 약 3만원, 장문 약 9만원의 실비가 발생합니다.</li>
              <li>
                부고 문자는 커뮤니티 활성화를 위해 밴드 링크 외의 다른 URL을 첨부하지 않습니다.
              </li>
              <li>
                동문회 문자를 받지 않으려면 졸업기수, 입학학번, 성함과 함께 문자 수신 거부 의사를
                문자메시지로 보내 주세요.
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="tp-bg-cream border tp-border-gold/40 rounded-lg p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Heart className="text-red-600" size={20} />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            동문 여러분의 기쁨과 슬픔에 항상 함께하겠습니다. 자세한 사항은 동문회 카카오톡으로 문의해 주세요.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}