import { Component, Suspense, type ReactNode } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function RouteLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <LoadingSpinner size="large" />
      <p className="text-sm text-gray-600">화면을 불러오는 중입니다.</p>
    </div>
  );
}

export function RouteLoadError() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4" role="alert">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold mb-2">화면을 불러오지 못했습니다</h2>
        <p className="text-sm text-gray-600 mb-6">
          네트워크 연결을 확인한 뒤 다시 시도해 주세요. 새 버전이 배포된 경우 새로고침이 필요할 수 있습니다.
        </p>
        <button className="bg-gray-900 text-white px-5 py-2.5 rounded-md" onClick={() => window.location.reload()}>
          새로고침
        </button>
        <div className="mt-4"><a className="text-sm text-gray-500 underline" href="/">홈으로 돌아가기</a></div>
      </div>
    </div>
  );
}

// Reload fetches the latest HTML as well as clearing React.lazy's cached rejection.
// No automatic reload loop, and no raw exception details in the public UI.
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <RouteLoadError /> : this.props.children;
  }
}

export function RouteBoundary({ children, routeKey }: { children: ReactNode; routeKey: string }) {
  return (
    <RouteErrorBoundary key={routeKey}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
