import { SITE_NAME } from "@shared/site";
import { PublicHeading } from "@/components/public-heading";
import { useScrollToTop } from "@/hooks/use-scroll-to-top";
import { PublicLayout } from "@/app/layout/public-layout";
import { usePublicPageSeo } from "@/lib/seo";

import { currentOfficerTerm, officerTerms, presidents } from "@shared/heritage/content";
import type { Officer } from "@shared/heritage/types";

const groupLayouts: Record<string, { grid: string; size: "lg" | "md" | "sm" }> = {
  leaders: { grid: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4", size: "lg" },
  auditors: { grid: "grid grid-cols-2 gap-4 max-w-sm", size: "md" },
  directors: { grid: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4", size: "sm" },
};

function ExecCard({ exec, size = "md" }: { exec: Officer; size?: "lg" | "md" | "sm" }) {
  const nameSize =
    size === "lg"
      ? "text-lg font-bold"
      : size === "md"
        ? "text-base font-semibold"
        : "text-sm font-semibold";
  const titleSize = size === "lg" ? "text-sm" : "text-xs";

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      {exec.photo ? (
        <img
          src={exec.photo}
          alt={`${exec.name} ${exec.title}`}
          className="w-full h-auto rounded-lg object-contain"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-lg bg-gray-100 flex items-center justify-center">
          <span className="text-4xl text-gray-400 font-bold">{exec.name[0]}</span>
        </div>
      )}
      <div className="text-center">
        <p className={`${nameSize} text-gray-900`}>{exec.name}</p>
        <p className={`${titleSize} font-medium tp-text-emphasis mt-0.5`}>{exec.title}</p>
        {exec.subtitle && <p className={`${titleSize} text-gray-500 mt-0.5`}>{exec.subtitle}</p>}
      </div>
    </div>
  );
}

export default function AboutExecutives() {
  usePublicPageSeo("/about/executives");
  useScrollToTop();
  const current = officerTerms.find((term) => term.term === currentOfficerTerm);
  const president = presidents.find((person) => person.term === currentOfficerTerm);

  return (
    <PublicLayout>
      <div className="public-page public-page--wide">
        <PublicHeading title="임원 명단" eyebrow="EXECUTIVES" className="mb-10">
          <p className="text-sm text-gray-500 mt-3">
            {SITE_NAME} {currentOfficerTerm}대 임원진
          </p>
          {president && (
            <p className="text-xs text-gray-400 mt-1">
              임기: {president.startYear}년 ~ {president.endYear}년
            </p>
          )}
        </PublicHeading>

        {current?.groups.map((group) => {
          const layout = groupLayouts[group.id] ?? groupLayouts.directors;
          return (
            <section key={group.id} className="mb-12">
              <h2 className="public-section-title">{group.title}</h2>
              <div className={layout.grid}>
                {group.members.map((exec) => (
                  <ExecCard key={`${exec.title}-${exec.name}`} exec={exec} size={layout.size} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PublicLayout>
  );
}
