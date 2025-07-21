import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";
import { useLocation } from "wouter";

export function AppHeader() {
  const [location, setLocation] = useLocation();
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 kakao rounded-full flex items-center justify-center">
              <GraduationCap className="kakao-brown" size={16} />
            </div>
            <h1 className="text-lg font-bold kakao-brown">동국한의동문회</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2 text-gray-600 hover:text-kakao-brown"
              onClick={() => setLocation("/search")}
            >
              <Search size={20} />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
