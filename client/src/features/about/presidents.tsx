import { Link } from "wouter";
import { currentOfficerTerm, presidents } from "@shared/heritage/content";
import { Card, CardContent } from "@/components/ui/card";
import { HeritagePage } from "./heritage/heritage-page";
import { personDetails } from "./heritage/record-details";

export default function AboutPresidents() {
  return (
    <HeritagePage section="presidents">
      <ol className="public-card-grid">
        {presidents.map((president) => (
          <li
            key={president.term}
            id={`president-${president.term}`}
            className="heritage-year-group"
          >
            <Card className="h-full">
              <CardContent className="p-5">
                <p className="heritage-meta">
                  제{president.term}대{president.term === currentOfficerTerm ? " · 현 회장" : ""}
                </p>
                <h2 className="public-card-title mt-1">{president.name}</h2>
                <p className="heritage-meta mt-2">{personDetails(president)}</p>
                <p className="mt-3 text-sm">
                  {president.startYear}년 ~ {president.endYear}년
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <Link href="/about/executives" className="heritage-text-link mt-6 inline-block">
        현재 임원 명단 보기
      </Link>
    </HeritagePage>
  );
}
