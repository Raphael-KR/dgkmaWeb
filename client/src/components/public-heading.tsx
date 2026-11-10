import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PublicHeadingProps = {
  title: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
  className?: string;
  level?: "page" | "section";
  size?: "page" | "section" | "document";
};

/** Public pages and landing sections share typography without owning navigation. */
export function PublicHeading({
  title,
  eyebrow,
  children,
  className,
  level = "page",
  size = level,
}: PublicHeadingProps) {
  const Wrapper = level === "page" ? "header" : "div";
  const Title = level === "page" ? "h1" : "h2";
  return (
    <Wrapper className={cn("public-heading", className)}>
      {eyebrow && <div className="public-heading-eyebrow">{eyebrow}</div>}
      <Title
        className={cn("public-heading-title", {
          "public-heading-title--page": size === "page",
          "public-heading-title--section": size === "section",
          "public-heading-title--document": size === "document",
        })}
      >
        {title}
      </Title>
      <div className="tp-divider public-heading-divider" />
      {children}
    </Wrapper>
  );
}
