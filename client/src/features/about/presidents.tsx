import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Link } from "wouter";
import { Award } from "lucide-react";
import { PublicLayout } from "@/app/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicPageSeo } from "@/lib/seo";

export default function AboutPresidents() {
  usePublicPageSeo("/about/presidents");
  useScrollToTop();

  return (
    <PublicLayout>
      <div className="public-page">
        <PublicHeading title="역대회장">
          <p className="text-sm text-gray-500 mt-3">동문회를 이끌어 온 발자취</p>
        </PublicHeading>
        <Card>
          <CardContent className="p-8 sm:p-12 text-center">
            <Award size={40} className="mx-auto mb-4 tp-text-gold-dark" aria-hidden="true" />
            <h2 className="text-lg font-semibold tp-text-green-dark">
              역대회장 안내를 준비하고 있습니다
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              역대 회장 명단과 재임 기간을 정리한 뒤 안내하겠습니다.
            </p>
            <Link
              href="/about/executives"
              className="inline-block mt-6 tp-text-gold-dark underline underline-offset-4"
            >
              현재 임원 명단 보기
            </Link>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
