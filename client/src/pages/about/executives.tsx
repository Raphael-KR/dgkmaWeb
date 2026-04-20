import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { useSeo } from "@/lib/seo";

type Executive = {
  name: string;
  title: string;
  subtitle?: string;
  photo: string;
};

const LEADERS: Executive[] = [
  { name: "최윤용", title: "회장", photo: "choi-yun-yong-president.avif" },
  { name: "최유행", title: "총회의장", photo: "choi-yu-haeng-speaker.avif" },
  { name: "박종웅", title: "수석부회장", photo: "park-jong-wung-svp.avif" },
  { name: "송상화", title: "부회장(부산지부장)", photo: "song-sang-hwa-vp.avif" },
  { name: "박경미", title: "부회장", photo: "park-kyung-mi-vp.avif" },
];

const AUDITORS: Executive[] = [
  { name: "이상운", title: "감사", photo: "lee-sang-un-auditor.avif" },
  { name: "오창영", title: "감사", photo: "oh-chang-young-auditor.avif" },
];

const DIRECTORS: Executive[] = [
  { name: "위지훈", title: "총무이사", photo: "wi-ji-hun-director.png" },
  { name: "성현호", title: "기획이사", photo: "sung-hyun-ho-director.avif" },
  { name: "성시현", title: "법률이사", photo: "sung-si-hyun-director.avif" },
  { name: "전가윤", title: "내외협력이사", subtitle: "41기 기장", photo: "jeon-ga-yun-director.avif" },
  { name: "정수아", title: "홍보이사", subtitle: "41기 부기장", photo: "jung-su-a-director.avif" },
  { name: "김선중", title: "이사", subtitle: "42기 기장", photo: "kim-sun-jung-director.avif" },
  { name: "장우진", title: "이사", subtitle: "42기 부기장", photo: "" },
  { name: "김정룡", title: "이사", subtitle: "부산지부 부회장", photo: "kim-jung-ryong-director.avif" },
  { name: "김효정", title: "이사", subtitle: "부산지부 총무", photo: "kim-hyo-jung-director.avif" },
  { name: "박주희", title: "이사", subtitle: "부산지부 재무", photo: "park-ju-hee-director.avif" },
  { name: "이채은", title: "이사", photo: "lee-chae-eun-director.avif" },
];

function ExecCard({ exec, size = "md" }: { exec: Executive; size?: "lg" | "md" | "sm" }) {
  const nameSize = size === "lg" ? "text-lg font-bold" : size === "md" ? "text-base font-semibold" : "text-sm font-semibold";
  const titleSize = size === "lg" ? "text-sm" : "text-xs";

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      {exec.photo ? (
        <img
          src={`/images/executives/${exec.photo}`}
          alt={`${exec.name} ${exec.title}`}
          className="w-full h-auto rounded-lg object-contain"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-lg bg-gray-100 flex items-center justify-center">
          <span className="text-4xl text-gray-400 font-bold">{exec.name[0]}</span>
        </div>
      )}
      <div className="text-center">
        <p className={`${nameSize} text-gray-900`}>{exec.name}</p>
        <p className={`${titleSize} font-medium tp-text-gold-dark mt-0.5`}>{exec.title}</p>
        {exec.subtitle && (
          <p className={`${titleSize} text-gray-500 mt-0.5`}>{exec.subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default function AboutExecutives() {
  useSeo({
    title: "임원 명단",
    description: "동국대학교한의과대학동문회 22대 임원 명단입니다.",
    path: "/about/executives",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-10 text-center">
          <div className="tp-text-gold-dark text-xs font-semibold tracking-widest mb-2">EXECUTIVES</div>
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">임원 명단</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-500 mt-3">동국대학교한의과대학동문회 22대 임원진</p>
        </header>

        {/* 지도부 */}
        <section className="mb-12">
          <h2 className="text-base font-semibold tp-text-green-dark mb-5 border-b border-[#1f4d2e]/20 pb-2">지도부</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {LEADERS.map((exec) => (
              <ExecCard key={exec.name} exec={exec} size="lg" />
            ))}
          </div>
        </section>

        {/* 감사 */}
        <section className="mb-12">
          <h2 className="text-base font-semibold tp-text-green-dark mb-5 border-b border-[#1f4d2e]/20 pb-2">감사</h2>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            {AUDITORS.map((exec) => (
              <ExecCard key={exec.name} exec={exec} size="md" />
            ))}
          </div>
        </section>

        {/* 이사 */}
        <section className="mb-12">
          <h2 className="text-base font-semibold tp-text-green-dark mb-5 border-b border-[#1f4d2e]/20 pb-2">이사</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {DIRECTORS.map((exec) => (
              <ExecCard key={exec.name} exec={exec} size="sm" />
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-gray-400 mt-8">임기: 2024 – 2026</p>
      </div>
    </PublicLayout>
  );
}
