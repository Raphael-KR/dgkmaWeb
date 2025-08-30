import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-kakao-gray p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/login")}
            className="flex items-center gap-2"
            data-testid="button-back"
          >
            <ArrowLeft size={16} />
            돌아가기
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-kakao-brown">
              개인정보 처리방침
            </CardTitle>
            <p className="text-sm text-gray-600">
              최종 개정일: 2025년 8월 30일
            </p>
          </CardHeader>
          
          <CardContent className="space-y-8">
            {/* 제1조 개인정보의 처리목적 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제1조 (개인정보의 처리목적)</h3>
              <div className="space-y-2 text-gray-700">
                <p>동국대학교 한의과대학 동문회는 다음의 목적을 위하여 개인정보를 처리합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>동문회 회원 가입 및 관리</li>
                  <li>동문회 서비스 제공 및 운영</li>
                  <li>동문회 행사 안내 및 참여 관리</li>
                  <li>회비 납부 및 관리</li>
                  <li>카카오톡을 통한 알림 서비스</li>
                  <li>동문 간 네트워킹 지원</li>
                </ul>
              </div>
            </section>

            {/* 제2조 개인정보의 처리 및 보유기간 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제2조 (개인정보의 처리 및 보유기간)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 개인정보는 수집·이용 목적이 달성된 후에는 해당 정보를 지체없이 파기합니다.</p>
                <p>② 다만, 다음의 정보에 대해서는 아래의 이유로 명시한 기간 동안 보존합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>회원 탈퇴 시: 회원정보는 즉시 삭제 (단, 법령에 의한 보존 의무가 있는 경우 제외)</li>
                  <li>부정 이용 방지: 부정 이용 기록은 1년간 보관</li>
                  <li>결제 관련 정보: 5년간 보관 (전자상거래법)</li>
                </ul>
              </div>
            </section>

            {/* 제3조 개인정보의 수집항목 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제3조 (처리하는 개인정보의 항목)</h3>
              <div className="space-y-4 text-gray-700">
                <div>
                  <h4 className="font-medium mb-2">① 회원가입 시 수집항목</h4>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>필수항목: 성명, 졸업년도, 학과, 카카오 계정 정보</li>
                    <li>선택항목: 연락처, 이메일, 근무지 정보</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">② 카카오톡 연동 시 수집항목</h4>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>카카오 계정 ID, 닉네임, 프로필 이미지</li>
                    <li>이메일 주소 (선택 동의 시)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">③ 서비스 이용 과정에서 자동 생성되는 정보</h4>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>접속 IP 주소, 서비스 이용 기록</li>
                    <li>쿠키, 접속 로그</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 제4조 개인정보의 제3자 제공 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제4조 (개인정보의 제3자 제공)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
                <p>② 다만, 다음의 경우에는 예외로 합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>이용자가 사전에 동의한 경우</li>
                  <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
                </ul>
              </div>
            </section>

            {/* 제5조 개인정보 처리위탁 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제5조 (개인정보 처리위탁)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 서비스 제공을 위해 다음과 같이 개인정보 처리업무를 위탁합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>위탁업체: 카카오 (카카오톡 로그인 및 알림 서비스)</li>
                  <li>위탁업무: 카카오 계정 인증, 메시지 발송</li>
                </ul>
                <p>② 위탁계약 시 개인정보보호법에 따라 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정합니다.</p>
              </div>
            </section>

            {/* 제6조 정보주체의 권리 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제6조 (정보주체의 권리·의무 및 행사방법)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 이용자는 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>개인정보 처리현황 통지 요구</li>
                  <li>개인정보 열람 요구</li>
                  <li>개인정보 정정·삭제 요구</li>
                  <li>개인정보 처리정지 요구</li>
                </ul>
                <p>② 권리 행사는 개인정보보호법 시행령 제41조제1항에 따라 서면, 전자우편, 모사전송(FAX) 등을 통하여 하실 수 있습니다.</p>
              </div>
            </section>

            {/* 제7조 개인정보의 파기 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제7조 (개인정보의 파기)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 개인정보는 보유기간의 경과, 처리목적 달성 등 그 개인정보가 불필요하게 되었을 때에는 지체없이 파기합니다.</p>
                <p>② 파기의 절차 및 방법은 다음과 같습니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>파기절차: 선정된 개인정보는 개인정보 보호책임자의 승인을 받아 파기합니다.</li>
                  <li>파기방법: 전자적 파일형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용합니다.</li>
                </ul>
              </div>
            </section>

            {/* 제8조 개인정보 보호책임자 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제8조 (개인정보 보호책임자)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제를 위하여 아래와 같이 개인정보 보호책임자를 지정합니다:</p>
                <div className="bg-gray-50 p-4 rounded-lg mt-3">
                  <p className="font-medium">개인정보 보호책임자</p>
                  <p>성명: 동문회 사무국장</p>
                  <p>연락처: 02-XXXX-XXXX</p>
                  <p>이메일: privacy@donggukhani.com</p>
                </div>
              </div>
            </section>

            {/* 제9조 개인정보 처리방침 변경 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제9조 (개인정보 처리방침 변경)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.</p>
              </div>
            </section>

            {/* 부칙 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">부칙</h3>
              <div className="space-y-2 text-gray-700">
                <p>본 방침은 2025년 8월 30일부터 시행됩니다.</p>
              </div>
            </section>

            {/* 문의 */}
            <section className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">개인정보 관련 문의</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">동국대학교 한의과대학 동문회</p>
                <p className="text-gray-600">개인정보보호 담당자</p>
                <p className="text-gray-600">이메일: privacy@donggukhani.com</p>
                <p className="text-gray-600">전화: 02-XXXX-XXXX</p>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}