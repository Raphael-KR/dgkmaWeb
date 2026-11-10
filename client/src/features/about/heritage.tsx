import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { Image as ImageIcon } from "lucide-react";
import { PublicLayout } from "@/app/layout/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePublicPageSeo } from "@/lib/seo";

const sections = [
  {
    id: "recent",
    label: "최근 활동",
    description: "동문들의 최근 활동 사진과 소식을 준비하고 있습니다.",
  },
  {
    id: "history",
    label: "역사 자료",
    description: "동문회의 발자취를 담은 사진과 기록을 준비하고 있습니다.",
  },
  {
    id: "events",
    label: "주요 행사",
    description: "동문회 주요 행사의 사진과 기록을 준비하고 있습니다.",
  },
];

export default function AboutHeritage() {
  usePublicPageSeo("/about/heritage");
  useScrollToTop();

  return (
    <PublicLayout>
      <div className="public-page public-page--wide">
        <PublicHeading title="역사관">
          <p className="text-sm text-gray-500 mt-3">사진과 기록으로 보는 동문회 역사</p>
        </PublicHeading>
        <Tabs defaultValue="recent">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            {sections.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((section) => (
            <TabsContent key={section.id} value={section.id}>
              <Card>
                <CardContent className="p-8 sm:p-12 text-center">
                  <ImageIcon
                    size={40}
                    className="mx-auto mb-4 tp-text-gold-dark"
                    aria-hidden="true"
                  />
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
