import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import type { MembershipTier } from "@shared/schema";

// 권리회원 = 당해년도 회비 납부자. 권리회원은 금색 강조, 일반회원은 회색.
export function MembershipBadge({
  tier,
  className,
}: {
  tier: MembershipTier;
  className?: string;
}) {
  if (tier === "권리회원") {
    return (
      <Badge
        className={`bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs px-3 py-1 ${className ?? ""}`}
        data-testid="badge-membership-tier"
      >
        <Crown className="mr-1" size={12} />
        권리회원
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className={`text-xs px-3 py-1 ${className ?? ""}`}
      data-testid="badge-membership-tier"
    >
      일반회원
    </Badge>
  );
}
