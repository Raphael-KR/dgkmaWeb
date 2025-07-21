
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { 
  Home, 
  MessageSquare, 
  Users, 
  User, 
  Shield, 
  Info,
  LogOut,
  X
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
  { path: "/info", label: "동문회 정보", icon: <Info size={20} /> },
  { path: "/boards", label: "게시판", icon: <MessageSquare size={20} />, requiresAuth: true },
  { path: "/directory", label: "동문 명부", icon: <Users size={20} />, requiresAuth: true },
  { path: "/profile", label: "내 정보", icon: <User size={20} />, requiresAuth: true },
  { path: "/admin", label: "관리자", icon: <Shield size={20} />, requiresAuth: true, adminOnly: true }
];

interface NavigationProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function Navigation({ isOpen, setIsOpen }: NavigationProps) {
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
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Side Menu */}
      <div className={`fixed top-0 left-0 h-full w-80 bg-white shadow-lg z-50 transform transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Close Button */}
          <div className="flex justify-end p-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </Button>
          </div>

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
      </div>
    </>
  );
}