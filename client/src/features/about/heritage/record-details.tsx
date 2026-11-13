import { Link } from "wouter";
import { documents } from "@shared/heritage/content";
import { heritageAlbumHref } from "@shared/heritage/navigation";
import type { Donation, HeritagePerson, HeritageSource } from "@shared/heritage/types";

export function personDetails(person: HeritagePerson) {
  return [
    person.admissionYear ? `${String(person.admissionYear).slice(-2)}학번` : undefined,
    person.graduationClass ? `졸업 ${person.graduationClass}기` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DonationDetails({ donations }: { donations: Donation[] }) {
  return (
    <ul className="heritage-donations" aria-label="기부 내역">
      {donations.map((donation, index) => (
        <li key={index}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong>{donation.amountWon.toLocaleString("ko-KR")}원</strong>
            <span className="heritage-meta">{donation.status}</span>
          </div>
          {donation.donor && <p className="text-sm">{donation.donor}</p>}
          {donation.purpose && <p className="heritage-meta">{donation.purpose}</p>}
        </li>
      ))}
    </ul>
  );
}

export function RecordLinks({
  albumIds = [],
  documentIds = [],
  sources = [],
}: {
  albumIds?: string[];
  documentIds?: string[];
  sources?: HeritageSource[];
}) {
  const relatedDocuments = documentIds.flatMap((id) =>
    documents.filter((document) => document.id === id),
  );
  if (!albumIds.length && !relatedDocuments.length && !sources.length) return null;

  return (
    <ul className="heritage-links" aria-label="관련 자료">
      {albumIds.map((id, index) => (
        <li key={id}>
          <Link href={heritageAlbumHref(id)}>
            관련 사진첩{albumIds.length > 1 ? ` ${index + 1}` : ""}
          </Link>
        </li>
      ))}
      {relatedDocuments.map((document) => (
        <li key={document.id}>
          <a href={document.src} target="_blank" rel="noopener noreferrer">
            문서 · {document.title}
          </a>
        </li>
      ))}
      {sources.map((source) => (
        <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
