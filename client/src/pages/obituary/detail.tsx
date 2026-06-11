import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, MapPin, User, Phone, CreditCard, Copy } from "lucide-react";
import { type Obituary } from "@shared/schema";

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start text-sm text-gray-700">
      <span className="text-gray-400 mr-2 mt-0.5">{icon}</span>
      <span className="font-medium mr-2 shrink-0">{label}:</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

export default function ObituaryDetail() {
  const [, params] = useRoute("/o/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: obituary, isLoading, error } = useQuery<Obituary>({
    queryKey: ["/api/obituaries", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-kakao-gray flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error || !obituary) {
    return (
      <div className="min-h-screen bg-kakao-gray">
        <div className="max-w-md mx-auto px-4 pt-8">
          <Card>
            <CardContent className="p-6 text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-2">부고를 찾을 수 없습니다</h2>
              <p className="text-gray-600 mb-4">요청하신 부고가 존재하지 않거나 삭제되었습니다.</p>
              <Button
                onClick={() => setLocation("/o")}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                <ArrowLeft size={16} className="mr-2" />
                부고 목록으로
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const copyAccount = async () => {
    if (!obituary.bankAccount) return;
    try {
      await navigator.clipboard.writeText(obituary.bankAccount);
      toast({ title: "복사 완료", description: "계좌번호가 복사되었습니다." });
    } catch {
      toast({
        title: "복사 실패",
        description: "계좌번호를 직접 복사해주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-kakao-gray pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/o")}>
            <ArrowLeft size={24} />
          </Button>
          <h1 className="text-lg font-bold ml-2">부고</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <Card className="overflow-hidden border-l-4 border-l-gray-900">
          <CardHeader className="bg-white pb-2">
            <div className="flex justify-between items-start">
              <Badge variant="outline" className="mb-2">
                {obituary.deceasedRelation}
              </Badge>
              <span className="text-xs text-gray-500">
                {new Date(obituary.createdAt!).toLocaleDateString()}
              </span>
            </div>
            <CardTitle className="text-xl font-bold text-gray-900">
              {obituary.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <DetailRow icon={<User size={16} />} label="고인" value={obituary.deceasedName} />
            <DetailRow icon={<Calendar size={16} />} label="별세" value={obituary.dateOfDeath} />
            {obituary.funeralHome && (
              <DetailRow icon={<MapPin size={16} />} label="빈소" value={obituary.funeralHome} />
            )}
            {obituary.jangji && (
              <DetailRow icon={<MapPin size={16} />} label="장지" value={obituary.jangji} />
            )}
            {obituary.chiefMourner && (
              <DetailRow icon={<User size={16} />} label="상주" value={obituary.chiefMourner} />
            )}
            {obituary.contactNumber && (
              <div className="flex items-center text-sm text-gray-700">
                <span className="text-gray-400 mr-2">
                  <Phone size={16} />
                </span>
                <span className="font-medium mr-2 shrink-0">연락처:</span>
                <a href={`tel:${obituary.contactNumber}`} className="text-blue-600 underline">
                  {obituary.contactNumber}
                </a>
              </div>
            )}

            {obituary.bankAccount && (
              <div className="pt-3 mt-1 border-t border-gray-100">
                <div className="flex items-center text-sm text-gray-700 mb-2">
                  <span className="text-gray-400 mr-2">
                    <CreditCard size={16} />
                  </span>
                  <span className="font-medium">마음 전하실 곳</span>
                </div>
                <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                  <span className="text-sm text-gray-800 break-all">{obituary.bankAccount}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyAccount}
                    className="ml-2 shrink-0"
                  >
                    <Copy size={14} className="mr-1" />
                    복사
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
