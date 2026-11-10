import { awards, formatHeritageDate, groupHeritageByYear } from "@shared/heritage/content";
import { HeritageEmpty, HeritagePage } from "./heritage-page";
import { personDetails, RecordLinks } from "./record-details";

export default function AboutAwards() {
  return (
    <HeritagePage section="awards">
      {!awards.length ? (
        <HeritageEmpty>등록된 수상 기록이 없습니다.</HeritageEmpty>
      ) : (
        <div className="space-y-10">
          {groupHeritageByYear(awards)
            .reverse()
            .map(([year, records]) => (
              <section key={year} aria-labelledby={`awards-${year}`}>
                <h2 id={`awards-${year}`} className="public-section-title">
                  {year}년
                </h2>
                <ul className="heritage-records">
                  {records.map((award) => (
                    <li key={award.id} className="heritage-record">
                      <time dateTime={award.date} className="heritage-meta">
                        {formatHeritageDate(award.date)} · {award.issuer}
                      </time>
                      <h3 className="mt-1 font-semibold">
                        {award.title} · {award.recipient.name}
                      </h3>
                      {personDetails(award.recipient) && (
                        <p className="heritage-meta">{personDetails(award.recipient)}</p>
                      )}
                      {award.citation && <p className="heritage-description">{award.citation}</p>}
                      <RecordLinks albumIds={award.albumIds} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </HeritagePage>
  );
}
