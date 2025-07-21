import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
  LogOut,
  X
} from "lucide-react";

const navigationItems = [
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

interface SimpleNavigationProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function SimpleNavigation({ isOpen, setIsOpen }: SimpleNavigationProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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
    <>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Side Menu */}
      <div 
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-kakao-yellow p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-kakao-brown">
              동국한의동문회
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-kakao-brown hover:bg-yellow-200"
            >
              <X size={20} />
            </Button>
          </div>
          {user && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-kakao-brown font-medium">
                {user.name}님
              </p>
              <div className="flex items-center gap-2">
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
          <nav>
            {filteredItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={`flex items-center space-x-3 px-6 py-4 text-sm font-medium cursor-pointer transition-colors ${
                    isActive
                      ? "bg-kakao-yellow text-kakao-brown border-r-4 border-kakao-brown"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}>
                    <span className={isActive ? "text-kakao-brown" : "text-gray-500"}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          {user ? (
            <Button
              variant="outline"
              className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut size={16} className="mr-2" />
              로그아웃
            </Button>
          ) : (
            <Link href="/login" onClick={() => setIsOpen(false)}>
              <Button className="w-full bg-kakao-yellow text-kakao-brown hover:bg-yellow-400">
                카카오 로그인
              </Button>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}