import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

import SimpleNavigation from "@/components/simple-navigation";
import AppHeader from "@/components/app-header";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { LogOut, Edit, Settings, Shield, Download, CreditCard } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/payments/user", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/payments/user/${user?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!user?.id,
  });

  // Scroll to payment section if coming from home page
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#payment-section') {
      setTimeout(() => {
        const element = document.getElementById('payment-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [location]);

  if (!user) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const currentYearPayment = payments?.find((p: any) => p.year === currentYear);

  return (
    <div className="min-h-screen bg-kakao-gray">

      
      <div className="max-w-md mx-auto px-4 pb-20">
        <div className="py-4">
          <h1 className="text-xl font-bold kakao-brown mb-6">내 정보</h1>
          
          {/* Profile Card */}
          <Card className="shadow-sm mb-6">
            <CardHeader className="text-center">
              <div className="w-20 h-20 kakao rounded-full mx-auto mb-4 flex items-center justify-center">
                <span className="kakao-brown font-bold text-2xl">
                  {user.name?.charAt(0) || "?"}
                </span>
              </div>
              <CardTitle className="text-xl">{user.name}</CardTitle>
              <p className="text-gray-600">
                {user.graduationYear ? `${user.graduationYear}년 졸업` : "졸업년도 미확인"}
              </p>
              <Badge className={user.isVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {user.isVerified ? "인증완료" : "인증대기"}
              </Badge>
            </CardHeader>
          </Card>

          {/* Account Info */}
          <Card className="shadow-sm mb-6">
            <CardHeader>
              <CardTitle className="text-lg">계정 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">이메일</p>
                <p className="font-medium">{user.email}</p>
              </div>
              {user.phoneNumber && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">연락처</p>
                  <p className="font-medium">{user.phoneNumber}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600 mb-1">가입일</p>
                <p className="font-medium">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Status */}
          <Card className="shadow-sm mb-6" id="payment-section">
            <CardHeader>
              <CardTitle className="text-lg">회비 관리</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Current Year Payment Status */}
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">{currentYear}년 연회비</p>
                {currentYearPayment ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-bold text-green-800">납부완료</p>
                      <p className="text-xs text-green-600">
                        {new Date(currentYearPayment.createdAt).toLocaleDateString()} 납부
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {currentYearPayment.amount.toLocaleString()}원
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <p className="font-bold text-yellow-800 text-sm">미납</p>
                      <p className="text-xs text-yellow-600">
                        {currentYear}년 연회비를 납부해 주세요.
                      </p>
                    </div>
                    <Button 
                      className="w-full kakao kakao-brown"
                      size="sm"
                      onClick={() => {
                        // Mock payment processing
                        alert("결제 시스템 연동 예정입니다. (토스페이, 카카오페이 등)");
                      }}
                    >
                      <CreditCard className="mr-2" size={14} />
                      50,000원 납부하기
                    </Button>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Payment History Summary */}
              <div>
                <p className="text-sm text-gray-600 mb-3">납부 내역</p>
                {paymentsLoading ? (
                  <div className="flex justify-center py-3">
                    <LoadingSpinner />
                  </div>
                ) : payments?.length === 0 ? (
                  <p className="text-center text-gray-500 py-3 text-sm">
                    납부 내역이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {payments?.slice(0, 3).map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div>
                          <p className="font-medium">{payment.year}년 {payment.type}</p>
                          <p className="text-xs text-gray-600">
                            {new Date(payment.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">
                            {payment.amount.toLocaleString()}원
                          </p>
                          <Badge 
                            variant={payment.status === "completed" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {payment.status === "completed" ? "완료" : "대기"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {payments?.length > 3 && (
                      <p className="text-center text-xs text-gray-500 pt-2">
                        총 {payments.length}건의 납부 내역
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="shadow-sm mb-6">
            <CardContent className="p-4 space-y-2">
              <Button variant="ghost" className="w-full justify-start">
                <Edit className="mr-3" size={20} />
                프로필 수정
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-3" size={20} />
                설정
              </Button>
              {user.isAdmin && (
                <>
                  <Separator />
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-blue-600"
                    onClick={() => setLocation("/admin")}
                  >
                    <Shield className="mr-3" size={20} />
                    관리자 패널
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Logout */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <Button 
                variant="ghost" 
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={logout}
              >
                <LogOut className="mr-3" size={20} />
                로그아웃
              </Button>
            </CardContent>
          </Card>

          {/* App Info */}
          <div className="text-center mt-8 text-gray-500">
            <p className="text-sm">동국한의동문회</p>
            <p className="text-xs">v1.0.0</p>
          </div>
        </div>
      </div>


    </div>
  );
}
