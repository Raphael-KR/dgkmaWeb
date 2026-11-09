import { useEffect } from "react";
import { Link } from "wouter";
import { Award } from "lucide-react";
import { PublicLayout } from "@/app/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { useSeo } from "@/lib/seo";
import { SITE_NAME } from "@shared/site";

export default function AboutPresidents() {
  useSeo({
    title: "역대회장",
    description: `${SITE_NAME} 역대회장 안내입니다.`,
    path: "/about/presidents",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">역대회장</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-500 mt-3">동문회를 이끌어 온 발자취</p>
        </header>
        <Card>
          <CardContent className="p-8 sm:p-12 text-center">
            <Award size={40} className="mx-auto mb-4 tp-text-gold-dark" aria-hidden="true" />
            <h2 className="text-lg font-semibold tp-text-green-dark">역대회장 안내를 준비하고 있습니다</h2>
            <p className="mt-3 text-sm text-gray-600">역대 회장 명단과 재임 기간을 정리한 뒤 안내하겠습니다.</p>
            <Link href="/about/executives" className="inline-block mt-6 tp-text-gold-dark underline underline-offset-4">
              현재 임원 명단 보기
            </Link>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
