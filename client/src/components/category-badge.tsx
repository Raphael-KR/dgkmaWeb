import type { Category } from "@shared/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type CategoryBadgeProps = {
  category?: Pick<Category, "badgeVariant" | "displayName"> | null;
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <Badge variant={category?.badgeVariant as BadgeProps["variant"]}>{category?.displayName}</Badge>
  );
}
