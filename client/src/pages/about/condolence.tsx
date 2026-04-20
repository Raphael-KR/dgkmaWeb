import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";

export default function AboutCondolence() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">CONDOLENCE</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">경조사 지원 안내</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">회원과 가족의 경조사를 동문회가 함께합니다.</p>
        </header>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">지원 대상</h2>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li>• 권리회원 본인 및 직계 가족 (배우자, 부모, 자녀)</li>
              <li>• 회비를 정상 납부 중인 회원에 한함</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">지원 범위</h2>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b tp-border-gold/40">
                    <th className="text-left py-2 px-2 tp-text-green-dark">구분</th>
                    <th className="text-left py-2 px-2 tp-text-green-dark">내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  <tr>
                    <td className="py-3 px-2 font-medium">결혼</td>
                    <td className="py-3 px-2">화환 또는 축의금 전달</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">출산</td>
                    <td className="py-3 px-2">축하 메시지 및 소정의 축하금</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">상사 (부고)</td>
                    <td className="py-3 px-2">조화 및 부의금 전달, 동문 부고 알림 발송</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">기타</td>
                    <td className="py-3 px-2">이사회 의결로 별도 지원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold tp-text-green-dark mb-3">신청 방법</h2>
            <ol className="space-y-2 text-gray-700 text-sm list-decimal list-inside">
              <li>로그인 후 <strong>부고 알림</strong> 메뉴에서 직접 등록 (상사의 경우)</li>
              <li>또는 동문회 사무국 카카오톡으로 사실 확인 가능한 정보와 함께 신청</li>
              <li>임원진 확인 후 지원 절차가 진행됩니다.</li>
            </ol>
          </CardContent>
        </Card>

        <div className="tp-bg-cream border tp-border-gold/40 rounded-lg p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Heart className="text-red-600" size={20} />
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            동문 여러분의 기쁨과 슬픔에 항상 함께하겠습니다. 자세한 사항은 동문회 사무국으로 문의해 주세요.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
