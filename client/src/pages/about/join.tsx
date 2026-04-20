import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginModal } from "@/components/auth/login-modal";
import { CheckCircle2, LogIn } from "lucide-react";

const steps = [
  { title: "카카오 로그인", desc: "카카오 계정으로 간편하게 로그인합니다." },
  { title: "졸업생 정보 자동 매칭", desc: "이름·휴대폰 번호로 동문 명부와 자동 대조됩니다." },
  { title: "본인 정보 확인 및 보완", desc: "기수, 연락처 등 누락된 정보를 입력합니다." },
  { title: "관리자 승인", desc: "확인 후 회원으로 승인됩니다 (보통 1~2일 이내)." },
  { title: "전체 메뉴 이용", desc: "게시판, 동문 명부, 회비 납부 등 모든 메뉴를 이용할 수 있습니다." },
];

export default function AboutJoin() {
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">JOIN</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">회원가입 안내</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-600 mt-3">동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자라면 누구나 회원으로 가입할 수 있습니다.</p>
        </header>

        <Card className="mb-8 border-2 tp-border-gold/30">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-bold tp-text-green-dark mb-4">회원 구성</h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex gap-2">
                <CheckCircle2 className="tp-text-gold-dark flex-shrink-0 mt-0.5" size={18} />
                <span><strong className="tp-text-green-dark">회원</strong> · 동국대학교 한의과대학 졸업자 또는 동 대학원 졸업자로서 본 홈페이지에 가입한 사람</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="tp-text-gold-dark flex-shrink-0 mt-0.5" size={18} />
                <span><strong className="tp-text-green-dark">권리회원</strong> · 당해 연도 회비를 완납한 회원. 총회 의결권 · 임원 피선거권 · 권리회원 전용 혜택 등을 행사할 수 있음</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="tp-text-gold-dark flex-shrink-0 mt-0.5" size={18} />
                <span><strong className="tp-text-green-dark">명예회원</strong> · 회원 자격에 해당하지 않으나, 본회 발전에 현저한 공로가 있어 회장의 추천과 이사회의 승인을 받은 사람</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <h2 className="text-xl font-bold tp-text-green-dark mb-4">가입 절차</h2>
        <ol className="space-y-4 mb-10">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <div className="w-9 h-9 rounded-full tp-bg-green text-white font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 pt-1">
                <div className="font-semibold tp-text-green-dark">{s.title}</div>
                <div className="text-sm text-gray-600 mt-0.5">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="tp-bg-cream border tp-border-gold/40 rounded-lg p-6 text-center">
          <p className="text-gray-700 mb-4">지금 바로 카카오 로그인으로 가입을 시작해보세요.</p>
          <Button
            size="lg"
            className="bg-kakao-yellow text-kakao-brown hover:bg-yellow-400 font-bold"
            onClick={() => setLoginOpen(true)}
          >
            <LogIn size={18} className="mr-2" /> 카카오로 가입하기
          </Button>
        </div>
      </div>
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} returnTo="/" />
    </PublicLayout>
  );
}
