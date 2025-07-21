import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

import SimpleNavigation from "@/components/simple-navigation";
import AppHeader from "@/components/app-header";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LogOut, Edit, Settings, Shield } from "lucide-react";

export default function Profile() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!user) {
    return null;
  }

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
                  <Button variant="ghost" className="w-full justify-start text-blue-600">
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
