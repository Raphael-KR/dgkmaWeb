import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type SiteNavLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  icon: LucideIcon;
};

export function SiteNavLink({ icon: Icon, className, children, ...props }: SiteNavLinkProps) {
  return (
    <Link {...props} className={cn("site-nav-link", className)}>
      <Icon aria-hidden="true" />
      {children}
    </Link>
  );
}
