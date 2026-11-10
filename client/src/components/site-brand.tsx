import { Link } from "wouter";
import { SITE_NAME } from "@shared/site";
import { cn } from "@/lib/utils";
import symbolLogo from "@assets/public-home/symbol-logo.svg";

type SiteLogoProps = {
  size?: "header" | "hero" | "auth";
  decorative?: boolean;
  className?: string;
};

const logoSizes = {
  header: "site-logo--header",
  hero: "site-logo--hero",
  auth: "site-logo--auth",
};

export function SiteLogo({ size = "header", decorative = false, className }: SiteLogoProps) {
  return (
    <img
      src={symbolLogo}
      alt={decorative ? "" : `${SITE_NAME} 로고`}
      className={cn("site-logo", logoSizes[size], className)}
    />
  );
}

export function SiteBrand({
  homeHref = "/",
  className,
  onClick,
}: {
  homeHref?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={homeHref}
      className={cn("site-brand", className)}
      aria-label={`${SITE_NAME} 홈`}
      onClick={onClick}
    >
      <SiteLogo decorative />
      <span className="site-brand__name">{SITE_NAME}</span>
    </Link>
  );
}
