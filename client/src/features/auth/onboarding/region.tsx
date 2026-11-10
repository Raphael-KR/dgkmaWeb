import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";

import { REGION_OPTIONS } from "@shared/contracts";
import { consumeAuthReturnPath } from "../lib/return-path";

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
        body: JSON.stringify({ activityRegion: region }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "지역 저장에 실패했습니다");
      }

      setLocation(consumeAuthReturnPath());
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
    <div className="member-screen screen-center p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">
            소속 지부 배정을 위한 지역 정보
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">현재 주로 활동하시는 지역을 선택해주세요.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">시/도 선택</label>
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
