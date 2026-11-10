import { Link } from "wouter";
import {
  formatHeritageDate,
  groupHeritageByYear,
  presidents,
  timeline,
} from "@shared/heritage/content";
import { HERITAGE_PAGES } from "@shared/heritage/navigation";
import type { HistoryEntry } from "@shared/heritage/types";
import { HeritagePage } from "./heritage/heritage-page";
import { DonationDetails, RecordLinks } from "./heritage/record-details";

function TimelineEntry({ entry }: { entry: HistoryEntry }) {
  const president = presidents.find((person) => person.term === entry.presidentTerm);
  return (
    <li id={entry.id} className="heritage-record">
      <time dateTime={entry.date} className="heritage-meta">
        {formatHeritageDate(entry.date)}
      </time>
      <h3 className="mt-1 font-semibold">{entry.title}</h3>
      {entry.description && <p className="heritage-description">{entry.description}</p>}
      {president && (
        <Link
          className="heritage-text-link"
          href={`${HERITAGE_PAGES.presidents.path}#president-${president.term}`}
        >
          제{president.term}대 {president.name} 회장
        </Link>
      )}
      {entry.donations && <DonationDetails donations={entry.donations} />}
      <RecordLinks
        albumIds={entry.albumIds}
        documentIds={entry.documentIds}
        sources={entry.sources}
      />
    </li>
  );
}

export default function AboutHeritage() {
  const years = groupHeritageByYear(timeline);
  return (
    <HeritagePage section="timeline">
      <nav aria-label="연혁 연도 바로가기" className="heritage-year-nav">
        {years.map(([year]) => (
          <a key={year} href={`#history-year-${year}`} className="heritage-year-link">
            {year}
          </a>
        ))}
      </nav>
      <div className="space-y-10">
        {years.map(([year, entries]) => (
          <section
            key={year}
            id={`history-year-${year}`}
            className="heritage-year-group"
            aria-labelledby={`history-heading-${year}`}
          >
            <h2 id={`history-heading-${year}`} className="public-section-title">
              {year}년
            </h2>
            <ol className="heritage-records">
              {entries.slice(0, 4).map((entry) => (
                <TimelineEntry key={entry.id} entry={entry} />
              ))}
            </ol>
            {entries.length > 4 && (
              <details className="mt-4">
                <summary className="heritage-text-link cursor-pointer">
                  {year}년 기록 {entries.length - 4}건 더 보기
                </summary>
                <ol className="heritage-records mt-4">
                  {entries.slice(4).map((entry) => (
                    <TimelineEntry key={entry.id} entry={entry} />
                  ))}
                </ol>
              </details>
            )}
          </section>
        ))}
      </div>
    </HeritagePage>
  );
}
