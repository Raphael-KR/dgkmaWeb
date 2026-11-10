import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { QueryError } from "@/components/query-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, RefreshCw, FileSpreadsheet, AlertCircle } from "lucide-react";
import type { useAlumniSync } from "./use-alumni-sync";

export function AlumniSyncPanel({
  alumniSyncState,
  preview,
  googleSheetsStatus,
  previewAlumniMutation,
  applyAlumniMutation,
  canPreview,
  canApply,
  googleSheetsError,
  googleSheetsFetching,
  refetchGoogleSheetsStatus,
}: ReturnType<typeof useAlumniSync>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileSpreadsheet size={20} />
          <span>Google Sheets 동문 데이터베이스</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 연결 상태 */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">연결 상태</h3>
          {googleSheetsError ? (
            <QueryError
              message="Google Sheets 연결 상태를 불러오지 못했습니다."
              onRetry={() => void refetchGoogleSheetsStatus()}
              retrying={googleSheetsFetching}
            />
          ) : googleSheetsStatus ? (
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${googleSheetsStatus.connected ? "bg-green-500" : "bg-red-500"}`}
              ></div>
              <span className="text-sm">
                {googleSheetsStatus.connected
                  ? googleSheetsStatus.message
                  : "Google Sheets에 연결되지 않았습니다."}
                {googleSheetsStatus.connected &&
                  googleSheetsStatus.sampleCount !== undefined &&
                  ` (${googleSheetsStatus.sampleCount}건 확인)`}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <LoadingSpinner />
              <span className="text-sm">연결 상태 확인 중...</span>
            </div>
          )}
        </div>

        {/* 동기화 기능 */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">데이터 동기화</h3>
          <p className="text-sm text-gray-600 mb-4">
            적용 전에 추가·수정 건수와 차단 오류를 확인합니다.
          </p>

          {alumniSyncState.errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>동기화 요청 실패</AlertTitle>
              <AlertDescription>{alumniSyncState.errorMessage}</AlertDescription>
            </Alert>
          )}

          {preview && (
            <div className="mb-4 space-y-3" aria-live="polite">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-gray-200">
                {[
                  ["원본", preview.report.sourceTotal],
                  ["DB", preview.report.databaseTotal],
                  ["추가", preview.report.insert],
                  ["수정", preview.report.update],
                  ["동일", preview.report.unchanged],
                  ["충돌", preview.report.conflict],
                  ["오류", preview.report.invalid],
                  ["원본만", preview.report.sourceOnly],
                  ["DB만", preview.report.databaseOnly],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-2 py-3 text-center">
                    <div className="text-lg font-semibold">{value}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              {preview.report.blocked && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>적용할 수 없는 명부입니다</AlertTitle>
                  <AlertDescription>
                    차단 오류{" "}
                    {preview.report.issues.reduce((total, issue) => total + issue.count, 0)}건을
                    원본에서 확인해주세요.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => previewAlumniMutation.mutate()}
              disabled={!canPreview}
            >
              {alumniSyncState.phase === "previewing" ? (
                <LoadingSpinner className="mr-2" />
              ) : (
                <RefreshCw className="mr-2" size={16} />
              )}
              변경 미리보기
            </Button>
            <Button onClick={() => applyAlumniMutation.mutate()} disabled={!canApply}>
              {alumniSyncState.phase === "applying" ? (
                <LoadingSpinner className="mr-2" />
              ) : (
                <Check className="mr-2" size={16} />
              )}
              변경 적용
            </Button>
          </div>
        </div>

        {/* 설정 안내 */}
        {!googleSheetsError && !googleSheetsFetching && googleSheetsStatus?.connected === false && (
          <div className="border rounded-lg p-4 bg-yellow-50">
            <h3 className="font-semibold mb-2 text-yellow-800">연결 확인 안내</h3>
            <div className="text-sm text-yellow-700 space-y-1">
              <p>
                연결 상태·서비스 계정 설정·스프레드시트 권한을 확인해 주세요. 일시적인 연결 실패일
                수도 있습니다.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void refetchGoogleSheetsStatus()}
            >
              연결 다시 확인
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
