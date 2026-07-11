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
  isPaused: boolean;
};

export function canApplyPreviewResponse(
  active: ActivePreviewIdentity,
  request: PreviewRequestIdentity,
): boolean {
  return !active.isPaused
    && active.eventType === "obituary"
    && active.eventType === request.eventType
    && active.draftId === request.draftId
    && active.contentFingerprint === request.contentFingerprint
    && active.requestVersion === request.requestVersion;
}
