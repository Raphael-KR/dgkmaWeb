import { Link } from "wouter";
import { formatHeritageDate, groupHeritageByYear, timeline } from "@shared/heritage/content";
import { heritageEntryHref } from "@shared/heritage/navigation";
import { HeritagePage } from "./heritage-page";
import { DonationDetails, RecordLinks } from "./record-details";

export default function AboutDonations() {
  const records = timeline.filter((entry) => entry.donations?.length);
  return (
    <HeritagePage section="donations">
      <div className="space-y-10">
        {groupHeritageByYear(records)
          .reverse()
          .map(([year, entries]) => (
            <section key={year} aria-labelledby={`donations-${year}`}>
              <h2 id={`donations-${year}`} className="public-section-title">
                {year}년
              </h2>
              <ul className="heritage-records">
                {entries.map((entry) => (
                  <li key={entry.id} className="heritage-record">
                    <time dateTime={entry.date} className="heritage-meta">
                      {formatHeritageDate(entry.date)}
                    </time>
                    <h3 className="mt-1 font-semibold">{entry.title}</h3>
                    <DonationDetails donations={entry.donations ?? []} />
                    <Link
                      className="heritage-text-link mt-3 inline-block"
                      href={heritageEntryHref(entry.id)}
                    >
                      관련 연혁 보기
                    </Link>
                    <RecordLinks albumIds={entry.albumIds} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </HeritagePage>
  );
}
