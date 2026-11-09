import { useEffect } from "react";
import { Image as ImageIcon } from "lucide-react";
import { PublicLayout } from "@/app/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSeo } from "@/lib/seo";
import { SITE_NAME } from "@shared/site";

const sections = [
  { id: "recent", label: "최근 활동", description: "동문들의 최근 활동 사진과 소식을 준비하고 있습니다." },
  { id: "history", label: "역사 자료", description: "동문회의 발자취를 담은 사진과 기록을 준비하고 있습니다." },
  { id: "events", label: "주요 행사", description: "동문회 주요 행사의 사진과 기록을 준비하고 있습니다." },
];

export default function AboutHeritage() {
  useSeo({
    title: "역사관",
    description: `${SITE_NAME}의 활동, 역사 자료와 주요 행사를 담는 역사관입니다.`,
    path: "/about/heritage",
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tp-text-green-dark">역사관</h1>
          <div className="tp-divider h-0.5 w-24 mx-auto mt-4" />
          <p className="text-sm text-gray-500 mt-3">사진과 기록으로 보는 동문회 역사</p>
        </header>
        <Tabs defaultValue="recent">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            {sections.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>{section.label}</TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id}>
              <Card>
                <CardContent className="p-8 sm:p-12 text-center">
                  <ImageIcon size={40} className="mx-auto mb-4 tp-text-gold-dark" aria-hidden="true" />
                  <h2 className="text-lg font-semibold tp-text-green-dark">{section.label}</h2>
                  <p className="mt-3 text-sm text-gray-600">{section.description}</p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PublicLayout>
  );
}
