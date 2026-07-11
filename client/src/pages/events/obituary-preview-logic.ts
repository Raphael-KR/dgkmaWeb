import type { CommunityEventType } from "@shared/community-events";

export type PreviewRequestIdentity = {
  eventType: CommunityEventType;
  draftId: number;
  contentFingerprint: string;
  requestVersion: number;
};

export type ActivePreviewIdentity = {
  eventType: CommunityEventType;
  draftId?: number;
  contentFingerprint: string;
  requestVersion: number;
  draftStatus: "idle" | "recovered" | "saved" | "saving";
  isPaused: boolean;
};

export function isObituaryPreviewEligible(active: ActivePreviewIdentity): boolean {
  return !active.isPaused
    && (active.draftStatus === "saved" || active.draftStatus === "recovered")
    && active.eventType === "obituary"
    && active.draftId !== undefined;
}

export function canApplyPreviewResponse(
  active: ActivePreviewIdentity,
  request: PreviewRequestIdentity,
): boolean {
  return isObituaryPreviewEligible(active)
    && active.eventType === request.eventType
    && active.draftId === request.draftId
    && active.contentFingerprint === request.contentFingerprint
    && active.requestVersion === request.requestVersion;
}
