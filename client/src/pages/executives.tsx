import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Executives() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/info');
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-kakao-gray flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600">페이지를 이동하는 중...</p>
      </div>
    </div>
  );
}