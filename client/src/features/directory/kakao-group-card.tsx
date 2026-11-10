import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageCircle } from "lucide-react";
import {
  KAKAO_GROUP_INVITE_ENDPOINT,
  type KakaoGroupInvite,
  type MembershipStatus,
} from "@shared/contracts";
import { useAuth } from "@/features/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-error";

export function KakaoGroupCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const {
    data: membership,
    isError,
    isFetching,
    refetch,
  } = useQuery<MembershipStatus>({
    queryKey: ["/api/membership/status"],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  async function joinGroup() {
    if (opening) return;
    setOpening(true);
    let httpStatus: number | null = null;
    try {
      // Fetch on a user action. The invitation is never kept in the query cache.
      const response = await fetch(KAKAO_GROUP_INVITE_ENDPOINT, {
        credentials: "include",
        cache: "no-store",
      });
      httpStatus = response.status;
      if (!response.ok) throw new Error("invitation_request_failed");
      const invitation: KakaoGroupInvite = await response.json();
      if (typeof invitation.url !== "string") throw new Error("invalid_invitation_response");
      window.location.assign(invitation.url);
    } catch (error) {
      console.warn("Kakao group invitation request failed", {
        httpStatus,
        errorType: error instanceof Error ? error.name : "UnknownError",
        privateDataOmitted: true,
      });
      toast({
        title: "단톡방 연결 실패",
        description:
          httpStatus === 403
            ? "권리회원만 참여할 수 있습니다. 현재 회원 등급을 다시 확인합니다."
            : "참여 주소를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      void refetch();
    } finally {
      setOpening(false);
    }
  }

  if (!user) return null;

  return (
    <Card className="mx-auto mt-6 shadow-sm md:max-w-xl">
      <CardContent className="p-6 text-center">
        <div className="kakao mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
          <MessageCircle size={24} aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-lg font-bold">권리회원 단톡방</h2>
        {isError ? (
          <QueryError
            message="회원 등급을 확인하지 못했습니다."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : !membership ? (
          <p className="text-sm text-muted-foreground" role="status">
            회원 등급을 확인하고 있습니다.
          </p>
        ) : membership.isPaid ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              권리회원 단톡방에서 동문 소식과 행사 안내를 받아보세요.
            </p>
            <Button variant="kakao" onClick={joinGroup} disabled={opening}>
              {opening ? "참여 링크 확인 중…" : "권리회원 단톡방 참여"}
            </Button>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              권리회원에게 제공되는 단톡방입니다. 회비 안내를 확인해 주세요.
            </p>
            <Button variant="outline" asChild>
              <Link href="/about/dues">회비 안내 보기</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
