import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
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
              동국대학교 한의과대학 동문회 서비스 이용약관
            </CardTitle>
            <p className="text-sm text-gray-600">
              최종 개정일: 2025년 8월 30일
            </p>
          </CardHeader>
          
          <CardContent className="space-y-8">
            {/* 제1조 목적 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제1조 (목적)</h3>
              <p className="text-gray-700 leading-relaxed">
                본 약관은 동국대학교 한의과대학 동문회(이하 "동문회")가 제공하는 온라인 서비스(이하 "서비스")의 이용조건 및 절차, 
                동문회와 이용자의 권리, 의무, 책임사항 등을 규정함을 목적으로 합니다.
              </p>
            </section>

            {/* 제2조 정의 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제2조 (정의)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① "서비스"란 동문회가 제공하는 동문 네트워킹, 정보 공유, 회비 관리 등의 온라인 서비스를 의미합니다.</p>
                <p>② "이용자"란 본 약관에 따라 서비스를 이용하는 동국대학교 한의과대학 졸업생을 의미합니다.</p>
                <p>③ "카카오톡 연동"이란 카카오 계정을 통한 간편 로그인 및 알림 서비스를 의미합니다.</p>
              </div>
            </section>

            {/* 제3조 약관의 효력과 변경 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제3조 (약관의 효력과 변경)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 본 약관은 서비스를 이용하고자 하는 모든 이용자에게 그 효력이 발생합니다.</p>
                <p>② 동문회는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.</p>
                <p>③ 약관이 개정되는 경우, 개정된 약관의 적용일자 및 개정사유를 명시하여 현행약관과 함께 공지합니다.</p>
              </div>
            </section>

            {/* 제4조 서비스의 제공 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제4조 (서비스의 제공)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 다음과 같은 서비스를 제공합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>동문 게시판 및 정보 공유</li>
                  <li>동문회 행사 안내 및 참여</li>
                  <li>회비 납부 및 관리</li>
                  <li>동문 네트워킹 및 연락처 서비스</li>
                  <li>카카오톡을 통한 알림 서비스</li>
                </ul>
                <p>② 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.</p>
              </div>
            </section>

            {/* 제5조 회원가입 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제5조 (회원가입)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 서비스 이용을 위해서는 동국대학교 한의과대학 졸업생임을 인증받아야 합니다.</p>
                <p>② 가입 신청 시 졸업생 데이터베이스와 자동 매칭되며, 매칭되지 않는 경우 관리자 승인을 거칩니다.</p>
                <p>③ 카카오 계정을 통한 간편 가입을 지원하며, 이때 카카오 서비스 약관도 함께 적용됩니다.</p>
              </div>
            </section>

            {/* 제6조 개인정보 보호 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제6조 (개인정보 보호)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 이용자의 개인정보를 관련 법령에 따라 보호합니다.</p>
                <p>② 수집하는 개인정보는 다음과 같습니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>필수정보: 성명, 졸업년도, 카카오 계정 정보</li>
                  <li>선택정보: 연락처, 근무지 정보</li>
                </ul>
                <p>③ 개인정보는 서비스 제공 목적으로만 사용되며, 동의 없이 제3자에게 제공하지 않습니다.</p>
              </div>
            </section>

            {/* 제7조 카카오톡 연동 서비스 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제7조 (카카오톡 연동 서비스)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 카카오톡 연동을 통해 다음 서비스를 제공합니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>간편 로그인 서비스</li>
                  <li>동문회 소식 및 행사 알림</li>
                  <li>회비 납부 안내</li>
                </ul>
                <p>② 카카오톡 연동은 이용자의 동의하에 이루어지며, 언제든지 연동을 해제할 수 있습니다.</p>
                <p>③ 카카오톡 관련 서비스는 카카오의 서비스 정책에 따라 제한될 수 있습니다.</p>
              </div>
            </section>

            {/* 제8조 이용자의 의무 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제8조 (이용자의 의무)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 이용자는 다음 행위를 하여서는 안 됩니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>타인의 개인정보를 도용하거나 허위 정보를 등록하는 행위</li>
                  <li>서비스의 안정적 운영을 방해하는 행위</li>
                  <li>다른 이용자에게 피해를 주는 행위</li>
                  <li>법령 또는 공서양속에 위반되는 행위</li>
                </ul>
                <p>② 이용자는 본인의 계정 정보를 안전하게 관리할 책임이 있습니다.</p>
              </div>
            </section>

            {/* 제9조 서비스 제한 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제9조 (서비스 이용 제한)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 이용자가 본 약관을 위반한 경우 서비스 이용을 제한할 수 있습니다.</p>
                <p>② 시스템 점검, 보수, 교체 등의 경우 서비스 제공을 일시 중단할 수 있습니다.</p>
              </div>
            </section>

            {/* 제10조 면책조항 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제10조 (면책조항)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 동문회는 천재지변, 전쟁, 기타 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</p>
                <p>② 동문회는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대해서는 책임지지 않습니다.</p>
                <p>③ 이용자 상호간 또는 이용자와 제3자 상호간에 서비스를 매개로 발생한 분쟁에 대해서는 개입하지 않습니다.</p>
              </div>
            </section>

            {/* 제11조 분쟁해결 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">제11조 (분쟁해결)</h3>
              <div className="space-y-2 text-gray-700">
                <p>① 서비스 이용과 관련하여 분쟁이 발생한 경우, 동문회와 이용자는 신의에 따라 해결하도록 노력합니다.</p>
                <p>② 분쟁이 해결되지 않는 경우, 관련 법령 및 민사소송법에 따라 해결합니다.</p>
              </div>
            </section>

            {/* 부칙 */}
            <section>
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">부칙</h3>
              <div className="space-y-2 text-gray-700">
                <p>본 약관은 2025년 8월 30일부터 시행됩니다.</p>
              </div>
            </section>

            {/* 문의 연락처 */}
            <section className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-3 text-kakao-brown">문의 연락처</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">동국대학교 한의과대학 동문회</p>
                <p className="text-gray-600">이메일: admin@donggukhani.com</p>
                <p className="text-gray-600">전화: 02-XXXX-XXXX</p>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}