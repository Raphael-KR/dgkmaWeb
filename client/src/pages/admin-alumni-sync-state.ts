import type { AlumniSyncReport } from "@shared/alumni-sync";

export type AlumniSyncPreview = {
  report: AlumniSyncReport;
  fingerprint: string | null;
};

export type AlumniSyncState = {
  phase: "idle" | "previewing" | "applying";
  preview: AlumniSyncPreview | null;
  errorMessage: string | null;
};

export type AlumniSyncAction =
  | { type: "preview-started" }
  | { type: "preview-succeeded"; preview: AlumniSyncPreview }
  | { type: "preview-failed"; message: string }
  | { type: "apply-started" }
  | { type: "apply-succeeded" }
  | { type: "apply-failed"; message: string };

export const alumniSyncInitialState: AlumniSyncState = {
  phase: "idle",
  preview: null,
  errorMessage: null,
};

export function alumniSyncReducer(
  state: AlumniSyncState,
  action: AlumniSyncAction,
): AlumniSyncState {
  switch (action.type) {
    case "preview-started":
      return { phase: "previewing", preview: null, errorMessage: null };
    case "preview-succeeded":
      return { phase: "idle", preview: action.preview, errorMessage: null };
    case "preview-failed":
      return { phase: "idle", preview: null, errorMessage: action.message };
    case "apply-started":
      return { phase: "applying", preview: state.preview, errorMessage: null };
    case "apply-succeeded":
      return alumniSyncInitialState;
    case "apply-failed":
      return { phase: "idle", preview: null, errorMessage: action.message };
  }
}

export function getAlumniSyncControls(
  state: AlumniSyncState,
  connected: boolean,
): { canPreview: boolean; canApply: boolean } {
  const busy = state.phase !== "idle";
  const report = state.preview?.report;
  const hasChanges = report ? report.insert + report.update > 0 : false;

  return {
    canPreview: connected && !busy,
    canApply: Boolean(
      connected
        && !busy
        && state.preview?.fingerprint
        && report
        && !report.blocked
        && hasChanges,
    ),
  };
}
