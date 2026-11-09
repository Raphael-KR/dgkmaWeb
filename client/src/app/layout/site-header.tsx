import type { ReactNode } from "react";
import { SiteBrand } from "@/components/site-brand";

type SiteHeaderProps = {
  actions: ReactNode;
  navigation: ReactNode;
  navigationLabel: string;
};

export function SiteHeader({ actions, navigation, navigationLabel }: SiteHeaderProps) {
  return (
    <header className="site-header site-brand-surface">
      <div className="site-container site-header__inner">
        <SiteBrand />
        <div className="site-header__actions">{actions}</div>
        <nav className="site-header__nav" aria-label={navigationLabel}>{navigation}</nav>
      </div>
    </header>
  );
}
