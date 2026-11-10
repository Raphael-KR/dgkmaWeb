import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { PublicLayout } from "@/app/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LegalPageProps = {
  title: string;
  revisionDate: string;
  children: ReactNode;
};

export function LegalPage({ title, revisionDate, children }: LegalPageProps) {
  const [, setLocation] = useLocation();

  return (
    <PublicLayout>
      <div className="min-h-screen tp-bg-cream p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else setLocation("/");
              }}
              className="flex items-center gap-2"
              data-testid="button-back"
            >
              <ArrowLeft size={16} />
              돌아가기
            </Button>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl font-bold tp-text-green-dark">{title}</CardTitle>
              <p className="text-sm text-gray-600">최종 개정일: {revisionDate}</p>
            </CardHeader>
            <CardContent className="space-y-8">{children}</CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
