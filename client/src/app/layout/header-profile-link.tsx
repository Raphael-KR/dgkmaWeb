import { User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function HeaderProfileLink({ name }: { name: string }) {
  const [location] = useLocation();

  return (
    <Button
      asChild
      variant="onBrand"
      size="sm"
      className="hidden max-w-[8rem] gap-1 font-normal md:inline-flex [&_svg]:size-3.5"
    >
      <Link
        href="/profile"
        aria-label={`${name}님 내정보`}
        aria-current={location === "/profile" ? "page" : undefined}
        title="내정보"
      >
        <User size={14} aria-hidden="true" />
        <span className="truncate">{name}님</span>
      </Link>
    </Button>
  );
}
