import { useReducer } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  alumniSyncInitialState,
  alumniSyncReducer,
  getAlumniSyncControls,
  type AlumniSyncPreview,
} from "./admin-alumni-sync-state";

type AlumniSyncApplyResponse = {
  report: AlumniSyncPreview["report"];
};

type GoogleSheetsStatus = {
  connected: boolean;
  message: string;
  sampleCount?: number;
};

async function readAdminResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : fallback);
  }
  return body as T;
}

export function useAlumniSync(enabled: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [alumniSyncState, dispatchAlumniSync] = useReducer(
    alumniSyncReducer,
    alumniSyncInitialState,
  );
  const preview = alumniSyncState.preview;

  // Google Sheets 연결 테스트
  const {
    data: googleSheetsStatus,
    isError: googleSheetsError,
    isFetching: googleSheetsFetching,
    refetch: refetchGoogleSheetsStatus,
  } = useQuery<GoogleSheetsStatus>({
    queryKey: ["/api/admin/test-google-sheets"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/admin/test-google-sheets", undefined, {
        signal,
      });
      return response.json();
    },
    enabled,
  });

  const previewAlumniMutation = useMutation<AlumniSyncPreview, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/admin/sync-alumni/preview", {
        method: "POST",
        credentials: "include",
      });
      return readAdminResponse<AlumniSyncPreview>(response, "변경 미리보기를 불러오지 못했습니다.");
    },
    onMutate: () => dispatchAlumniSync({ type: "preview-started" }),
    onSuccess: (nextPreview) =>
      dispatchAlumniSync({
        type: "preview-succeeded",
        preview: nextPreview,
      }),
    onError: (error) => {
      dispatchAlumniSync({ type: "preview-failed", message: error.message });
      toast({
        title: "미리보기 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const applyAlumniMutation = useMutation<AlumniSyncApplyResponse, Error>({
    mutationFn: async () => {
      if (!preview?.fingerprint) throw new Error("유효한 미리보기가 필요합니다.");
      const response = await fetch("/api/admin/sync-alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fingerprint: preview.fingerprint }),
      });
      return readAdminResponse<AlumniSyncApplyResponse>(
        response,
        "변경 사항을 적용하지 못했습니다.",
      );
    },
    onMutate: () => dispatchAlumniSync({ type: "apply-started" }),
    onSuccess: ({ report }) => {
      dispatchAlumniSync({ type: "apply-succeeded" });
      queryClient.invalidateQueries({ queryKey: ["/api/alumni"] });
      refetchGoogleSheetsStatus();
      toast({
        title: "명부 반영 완료",
        description: `${report.insert}건 추가, ${report.update}건 수정했습니다.`,
      });
    },
    onError: (error) => {
      dispatchAlumniSync({ type: "apply-failed", message: error.message });
      toast({
        title: "동기화 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { canPreview, canApply } = getAlumniSyncControls(
    alumniSyncState,
    !googleSheetsError && Boolean(googleSheetsStatus?.connected),
  );

  return {
    alumniSyncState,
    preview,
    googleSheetsStatus,
    googleSheetsError,
    googleSheetsFetching,
    refetchGoogleSheetsStatus,
    previewAlumniMutation,
    applyAlumniMutation,
    canPreview,
    canApply,
  };
}
