import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { 
  Menu, 
  Home, 
  MessageSquare, 
  CreditCard, 
  Users, 
  User, 
  Shield, 
  Info,
  UserCheck,
  FileText,
  Calendar,
  LogOut
} from "lucide-react";

interface NavigationItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  requiresAuth?: boolean;
  adminOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
  { path: "/", label: "홈", icon: <Home size={20} />, requiresAuth: true },
  { path: "/about", label: "동문회 소개", icon: <Info size={20} /> },
  { path: "/executives", label: "임원진", icon: <UserCheck size={20} /> },
  { path: "/history", label: "연혁", icon: <Calendar size={20} /> },
  { path: "/bylaws", label: "회칙", icon: <FileText size={20} /> },
  { path: "/boards", label: "게시판", icon: <MessageSquare size={20} />, requiresAuth: true },
  { path: "/payments", label: "회비 납부", icon: <CreditCard size={20} />, requiresAuth: true },
  { path: "/directory", label: "동문 명부", icon: <Users size={20} />, requiresAuth: true },
  { path: "/profile", label: "내 정보", icon: <User size={20} />, requiresAuth: true },
  { path: "/admin", label: "관리자", icon: <Shield size={20} />, requiresAuth: true, adminOnly: true }
];

export default function Navigation() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const filteredItems = navigationItems.filter(item => {
    if (item.requiresAuth && !user) return false;
    if (item.adminOnly && !user?.isAdmin) return false;
    return true;
  });

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  return (
    <div className="fixed top-4 left-4 z-50">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="outline" 
            size="icon"
            className="bg-kakao-yellow border-kakao-brown text-kakao-brown hover:bg-yellow-400 shadow-lg"
          >
            <Menu size={20} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 p-0">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-kakao-yellow p-6">
              <h2 className="text-xl font-bold text-kakao-brown">
                동국한의동문회
              </h2>
              {user && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-kakao-brown font-medium">
                    {user.name}님
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {user.graduationYear}년 졸업
                    </Badge>
                    {user.isAdmin && (
                      <Badge className="text-xs bg-red-100 text-red-800">
                        관리자
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Items */}
            <div className="flex-1 py-4">
              <nav className="space-y-2">
                {filteredItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`flex items-center space-x-3 px-6 py-3 text-sm font-medium transition-colors hover:bg-gray-100 ${
                        isActive
                          ? "bg-kakao-yellow text-kakao-brown border-r-2 border-kakao-brown"
                          : "text-gray-700"
                      }`}
                      onClick={() => setIsOpen(false)}
                    >
                      <span className={isActive ? "text-kakao-brown" : "text-gray-500"}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Footer */}
            {user && (
              <>
                <Separator />
                <div className="p-4">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} className="mr-2" />
                    로그아웃
                  </Button>
                </div>
              </>
            )}

            {/* Login prompt for non-authenticated users */}
            {!user && (
              <>
                <Separator />
                <div className="p-4">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button className="w-full kakao kakao-brown">
                      카카오 로그인
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}