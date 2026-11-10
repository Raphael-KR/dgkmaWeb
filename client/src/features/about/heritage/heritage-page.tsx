import { useEffect, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { HERITAGE_PAGES, type HeritageSection } from "@shared/heritage/navigation";
import { PublicLayout } from "@/app/layout/public-layout";
import { PublicHeading } from "@/components/public-heading";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicPageSeo } from "@/lib/seo";
import "./heritage.css";

export function HeritagePage({
  section,
  children,
}: {
  section: HeritageSection;
  children: ReactNode;
}) {
  const page = HERITAGE_PAGES[section];
  const search = useSearch();
  usePublicPageSeo(page.path);

  useEffect(() => {
    function revealRecord() {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) {
        window.scrollTo(0, 0);
        return;
      }
      const details = target.closest("details");
      if (details) details.open = true;
      target.scrollIntoView();
    }
    revealRecord();
    window.addEventListener("hashchange", revealRecord);
    return () => window.removeEventListener("hashchange", revealRecord);
  }, [section, search]);

  return (
    <PublicLayout>
      <div className="public-page public-page--wide">
        <PublicHeading title={page.title} eyebrow="역사관">
          <p className="heritage-intro">{page.description}</p>
        </PublicHeading>
        <nav aria-label="역사관 메뉴" className="heritage-menu">
          {Object.entries(HERITAGE_PAGES).map(([key, item]) => (
            <Link
              key={key}
              href={item.path}
              className="heritage-menu-link"
              aria-current={section === key ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </PublicLayout>
  );
}

export function HeritageEmpty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground sm:p-12">
        {children}
      </CardContent>
    </Card>
  );
}
