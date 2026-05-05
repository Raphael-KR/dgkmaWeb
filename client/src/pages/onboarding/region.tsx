import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";

// v5 — 활동 지역(시/도) 18개. 카카오 응답에는 없는 항목이라 별도 온보딩 폼에서 수집한다.
const REGION_OPTIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도',
  '제주특별자치도', '해외',
];

export default function OnboardingRegion() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [region, setRegion] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!region) {
      toast({
        title: "지역을 선택해주세요",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/users/activity-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // 서버는 activityRegion(권장) / region(하위호환) 둘 다 허용. 권장 키로 전송.
        body: JSON.stringify({ activityRegion: region }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "지역 저장에 실패했습니다");
      }

      // 로그인 시 보관해둔 returnTo가 있으면 그곳으로, 없으면 홈으로.
      let dest = "/";
      try {
        const stored = sessionStorage.getItem("auth:returnTo");
        if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
          dest = stored;
        }
        sessionStorage.removeItem("auth:returnTo");
      } catch {}
      setLocation(dest);
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center tp-bg-cream p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tp-text-green-dark">
            소속 지부 배정을 위한 지역 정보
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            현재 주로 활동하시는 지역을 선택해주세요.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              시/도 선택
            </label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger data-testid="select-region">
                <SelectValue placeholder="활동 지역을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r} data-testid={`region-option-${r}`}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            ※ 입력하신 지역은 동문회 지부 배정 및 지역별 안내를 위해 사용됩니다.
          </p>

          <Button
            onClick={handleSubmit}
            disabled={!region || submitting}
            className="w-full"
            data-testid="button-submit-region"
          >
            {submitting ? <LoadingSpinner size="small" /> : "다음"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
