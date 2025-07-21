import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNavigation } from "@/components/layout/bottom-navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Download, CreditCard } from "lucide-react";

export default function Payments() {
  const { user } = useAuth();

  const { data: payments, isLoading } = useQuery({
    queryKey: ["/api/payments/user", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/payments/user/${user?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!user?.id,
  });

  const currentYear = new Date().getFullYear();
  const currentYearPayment = payments?.find((p: any) => p.year === currentYear);

  return (
    <div className="min-h-screen bg-kakao-gray">
      <AppHeader />
      
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-6">회비 관리</h1>
          
          {/* Current Year Status */}
          <Card className="shadow-sm mb-6">
            <CardHeader>
              <CardTitle className="text-lg">{currentYear}년 연회비</CardTitle>
            </CardHeader>
            <CardContent>
              {currentYearPayment ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-bold text-green-800">납부완료</p>
                      <p className="text-sm text-green-600">
                        {new Date(currentYearPayment.createdAt).toLocaleDateString()} 납부
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-600">
                        {currentYearPayment.amount.toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <Button className="w-full" variant="outline">
                    <Download className="mr-2" size={16} />
                    영수증 다운로드
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="font-bold text-yellow-800 mb-1">미납</p>
                    <p className="text-sm text-yellow-600">
                      {currentYear}년 연회비를 납부해 주세요.
                    </p>
                  </div>
                  <Button 
                    className="w-full kakao kakao-brown"
                    onClick={() => {
                      // Mock payment processing
                      alert("결제 시스템 연동 예정입니다. (토스페이, 카카오페이 등)");
                    }}
                  >
                    <CreditCard className="mr-2" size={16} />
                    50,000원 납부하기
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">납부 내역</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <LoadingSpinner />
                </div>
              ) : payments?.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  납부 내역이 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {payments?.map((payment: any) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{payment.year}년 {payment.type}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {payment.amount.toLocaleString()}원
                        </p>
                        <Badge variant={payment.status === "completed" ? "default" : "secondary"}>
                          {payment.status === "completed" ? "완료" : "대기"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
