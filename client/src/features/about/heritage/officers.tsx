import { Link } from "wouter";
import { currentOfficerTerm, officerTerms, presidents } from "@shared/heritage/content";
import { HERITAGE_PAGES } from "@shared/heritage/navigation";
import { HeritagePage } from "./heritage-page";
import { personDetails } from "./record-details";

export default function AboutHistoricalOfficers() {
  return (
    <HeritagePage section="officers">
      <p className="heritage-meta mb-6">확인된 자료가 있는 대수의 임원진을 안내합니다.</p>
      <div className="space-y-12">
        {[...officerTerms]
          .sort((a, b) => b.term - a.term)
          .map((term) => {
            const president = presidents.find((person) => person.term === term.term);
            return (
              <section key={term.term} aria-labelledby={`officers-${term.term}`}>
                <h2 id={`officers-${term.term}`} className="public-section-title">
                  제{term.term}대 동문회 임원
                </h2>
                <div className="mb-5 flex flex-wrap gap-4 text-sm">
                  {president && (
                    <Link
                      className="heritage-text-link"
                      href={`${HERITAGE_PAGES.presidents.path}#president-${term.term}`}
                    >
                      회장 {president.name}
                    </Link>
                  )}
                  {term.term === currentOfficerTerm && (
                    <Link className="heritage-text-link" href="/about/executives">
                      현재 임원 사진 보기
                    </Link>
                  )}
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {term.groups.map((group) => (
                    <div key={group.title}>
                      <h3 className="mb-3 font-semibold">{group.title}</h3>
                      <ul className="divide-y rounded-lg border px-4">
                        {group.members.map((member) => (
                          <li key={`${member.title}-${member.name}`} className="py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <strong>{member.name}</strong>
                              <span className="heritage-meta">{member.title}</span>
                            </div>
                            {personDetails(member) && (
                              <p className="heritage-meta">{personDetails(member)}</p>
                            )}
                            {member.subtitle && <p className="heritage-meta">{member.subtitle}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
      </div>
    </HeritagePage>
  );
}
