import assert from "node:assert/strict";
import test from "node:test";
import type { AlumniSyncReport } from "@shared/alumni-sync";
import {
  alumniSyncInitialState,
  alumniSyncReducer,
  getAlumniSyncControls,
  type AlumniSyncPreview,
} from "../client/src/pages/admin-alumni-sync-state";

const report: AlumniSyncReport = {
  sourceTotal: 2,
  databaseTotal: 1,
  insert: 1,
  update: 1,
  unchanged: 0,
  conflict: 0,
  invalid: 0,
  sourceOnly: 1,
  databaseOnly: 0,
  blocked: false,
  sourceFingerprint: `sha256:${"a".repeat(64)}`,
  issues: [],
};

const preview: AlumniSyncPreview = {
  report,
  fingerprint: report.sourceFingerprint,
};

test("preview start invalidates stale preview and mutually disables controls", () => {
  const ready = alumniSyncReducer(alumniSyncInitialState, {
    type: "preview-succeeded",
    preview,
  });
  assert.deepEqual(getAlumniSyncControls(ready, true), {
    canPreview: true,
    canApply: true,
  });

  const previewing = alumniSyncReducer(ready, { type: "preview-started" });
  assert.equal(previewing.phase, "previewing");
  assert.equal(previewing.preview, null);
  assert.deepEqual(getAlumniSyncControls(previewing, true), {
    canPreview: false,
    canApply: false,
  });
});

test("preview success enables apply only for an unblocked plan with changes", () => {
  const ready = alumniSyncReducer(alumniSyncInitialState, {
    type: "preview-succeeded",
    preview,
  });
  assert.equal(ready.preview, preview);
  assert.equal(ready.errorMessage, null);
  assert.equal(getAlumniSyncControls(ready, true).canApply, true);
  assert.equal(getAlumniSyncControls(ready, false).canApply, false);

  for (const blockedReport of [
    { ...report, blocked: true },
    { ...report, insert: 0, update: 0 },
  ]) {
    const blocked = alumniSyncReducer(alumniSyncInitialState, {
      type: "preview-succeeded",
      preview: { ...preview, report: blockedReport },
    });
    assert.equal(getAlumniSyncControls(blocked, true).canApply, false);
  }
});

test("preview remains available when the connection probe reports source validation errors", () => {
  assert.deepEqual(getAlumniSyncControls(alumniSyncInitialState, false), {
    canPreview: true,
    canApply: false,
  });
});

test("apply start disables both controls and success clears the preview", () => {
  const ready = alumniSyncReducer(alumniSyncInitialState, {
    type: "preview-succeeded",
    preview,
  });
  const applying = alumniSyncReducer(ready, { type: "apply-started" });
  assert.equal(applying.phase, "applying");
  assert.equal(applying.preview, preview);
  assert.deepEqual(getAlumniSyncControls(applying, true), {
    canPreview: false,
    canApply: false,
  });

  const applied = alumniSyncReducer(applying, { type: "apply-succeeded" });
  assert.deepEqual(applied, alumniSyncInitialState);
});

test("preview and apply failures clear stale state and retain only safe messages", () => {
  const previewFailed = alumniSyncReducer(
    { ...alumniSyncInitialState, preview },
    { type: "preview-failed", message: "미리보기 실패" },
  );
  assert.equal(previewFailed.preview, null);
  assert.equal(previewFailed.errorMessage, "미리보기 실패");

  const applyFailed = alumniSyncReducer(
    { ...alumniSyncInitialState, phase: "applying", preview },
    { type: "apply-failed", message: "다시 미리보기 해주세요" },
  );
  assert.equal(applyFailed.phase, "idle");
  assert.equal(applyFailed.preview, null);
  assert.equal(applyFailed.errorMessage, "다시 미리보기 해주세요");
  assert.deepEqual(getAlumniSyncControls(applyFailed, true), {
    canPreview: true,
    canApply: false,
  });
});
