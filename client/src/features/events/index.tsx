import { lazy } from "react";

export const CommunityEventDetail = lazy(() => import("./detail"));
export const ObituaryDetail = lazy(() => import("./obituary/detail"));
const CommunityEventsPage = lazy(() => import("./page"));
export default CommunityEventsPage;
