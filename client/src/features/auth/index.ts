import { lazy } from "react";

export { AuthProvider, useAuth, type LoginResult } from "./hooks/use-auth";
export { AuthGate } from "./components/auth-gate";
export { LoginModal } from "./components/login-modal";
export const Login = lazy(() => import("./login"));
export const KakaoCallback = lazy(() => import("./kakao-callback"));
export const OnboardingRegion = lazy(() => import("./onboarding/region"));
