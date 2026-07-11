import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Phone, RefreshCw, UserRound } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { COMMUNITY_EVENTS_SEO, useSeo } from "@/lib/seo";
import { EVENT_TYPE_LABELS, type PublishedCommunityEvent } from "./event-list";
import type { CommunityEventType } from "@shared/community-events";
import {
  classifyEventDetailError,
  loadCommunityEventDetail,
  safeExternalHttpUrl,
} from "./event-detail-logic";

type DetailRowProps = {
  label: string;
  value: React.ReactNode;
};

type ObituaryDetails = {
  deceasedName?: string;
  deceasedAge?: number;
  relationship?: string;
  funeralDate?: string;
  funeralHome?: string;
  burialPlace?: string;
  chiefMourner?: string;
  familyContact?: string;
  accountInfo?: string;
  legacyDateOfDeath?: string;
  sourceUrl?: string;
};

const eventDateLabels: Record<CommunityEventType, string> = {
  obituary: "별세",
  wedding: "결혼 일시",
  opening: "개원 일시",
  other: "일시",
};

const locationLabels: Record<CommunityEventType, string> = {
  obituary: "빈소",
  wedding: "예식장",
  opening: "장소",
  other: "장소",
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3 text-sm">
      <dt className="font-medium text-gray-600">{label}</dt>
      <dd className="break-words text-gray-900">{value}</dd>
    </div>
  );
}

function isEventDetails(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getDetailText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getDetailAge(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 130
    ? value
    : undefined;
}

function getObituaryDetails(details: unknown): ObituaryDetails {
  const safeDetails = isEventDetails(details) ? details : {};

  return {
    deceasedName: getDetailText(safeDetails.deceasedName),
    deceasedAge: getDetailAge(safeDetails.deceasedAge),
    relationship: getDetailText(safeDetails.relationship),
    funeralDate: getDetailText(safeDetails.funeralDate),
    funeralHome: getDetailText(safeDetails.funeralHome),
    burialPlace: getDetailText(safeDetails.burialPlace),
    chiefMourner: getDetailText(safeDetails.chiefMourner),
    familyContact: getDetailText(safeDetails.familyContact),
    accountInfo: getDetailText(safeDetails.accountInfo),
    legacyDateOfDeath: getDetailText(safeDetails.legacyDateOfDeath),
    sourceUrl: safeExternalHttpUrl(safeDetails.sourceUrl),
  };
}

function getMemo(details: unknown) {
  const safeDetails = isEventDetails(details) ? details : {};
  return getDetailText(safeDetails.memo);
}

export default function CommunityEventDetail() {
  const [, params] = useRoute("/events/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: event, isLoading, error, isFetching, refetch } = useQuery<PublishedCommunityEvent>({
    queryKey: ["/api/events", id],
    queryFn: () => loadCommunityEventDetail<PublishedCommunityEvent>(fetch, id!),
    enabled: Boolean(id),
  });

  useSeo({
    ...COMMUNITY_EVENTS_SEO.detail,
    path: id ? `/events/${id}` : "/events",
    type: "article",
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error && classifyEventDetailError(error) === "not-found") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-lg font-semibold text-gray-900">경조사를 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-gray-600">요청하신 경조사가 존재하지 않거나 공개되지 않았습니다.</p>
          <Button className="mt-5" variant="outline" onClick={() => setLocation("/events")}>
            <ArrowLeft aria-hidden="true" />
            경조사 목록으로
          </Button>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-lg font-semibold text-gray-900">경조사 상세를 불러오지 못했습니다</h1>
          <p className="mt-2 text-sm text-gray-600">연결을 확인한 뒤 다시 불러와주세요.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="경조사 상세 다시 불러오기"
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden="true" />
              다시 불러오기
            </Button>
            <Button variant="ghost" onClick={() => setLocation("/events")}>
              <ArrowLeft aria-hidden="true" />
              경조사 목록으로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const obituaryDetails = event.eventType === "obituary" ? getObituaryDetails(event.details) : undefined;
  const memo = event.eventType === "obituary" ? undefined : getMemo(event.details);
  const backPath = `/events?type=${event.eventType}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation(backPath)}>
          <ArrowLeft aria-hidden="true" />
          경조사 목록
        </Button>

        <article className="mt-4 border-y border-gray-200 bg-white py-5">
          <div className="px-4 sm:px-5">
            <Badge variant="outline">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
            <h1 className="mt-3 break-words text-xl font-semibold text-gray-900">
              {event.title || "제목 없는 경조사"}
            </h1>
          </div>

          <dl className="mt-5 divide-y divide-gray-100 border-y border-gray-100 px-4 sm:px-5">
            <DetailRow label={eventDateLabels[event.eventType]} value={event.eventDate || "일정 미정"} />
            {event.location && <DetailRow label={locationLabels[event.eventType]} value={event.location} />}
            <DetailRow label="관련 동문" value={event.relatedMemberName || "관련 동문 미정"} />
            {obituaryDetails?.deceasedName && (
              <DetailRow
                label="고인"
                value={`${obituaryDetails.deceasedName}${obituaryDetails.deceasedAge ? ` (향년 ${obituaryDetails.deceasedAge}세)` : ""}`}
              />
            )}
            {obituaryDetails?.relationship && <DetailRow label="관계" value={obituaryDetails.relationship} />}
            {obituaryDetails?.funeralHome && <DetailRow label="빈소" value={obituaryDetails.funeralHome} />}
            {obituaryDetails?.funeralDate && <DetailRow label="발인" value={obituaryDetails.funeralDate} />}
            {obituaryDetails?.legacyDateOfDeath && <DetailRow label="별세" value={obituaryDetails.legacyDateOfDeath} />}
            {obituaryDetails?.burialPlace && <DetailRow label="장지" value={obituaryDetails.burialPlace} />}
            {obituaryDetails?.chiefMourner && <DetailRow label="상주" value={obituaryDetails.chiefMourner} />}
            {(event.contactNumber || obituaryDetails?.familyContact) && (
              <DetailRow label="연락처" value={event.contactNumber || obituaryDetails?.familyContact || ""} />
            )}
            {(event.accountInfo || obituaryDetails?.accountInfo) && (
              <DetailRow label="마음 전하실 곳" value={event.accountInfo || obituaryDetails?.accountInfo || ""} />
            )}
            {obituaryDetails?.sourceUrl && (
              <DetailRow
                label="모바일 부고장"
                value={(
                  <a
                    href={obituaryDetails.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-700 underline underline-offset-2"
                  >
                    모바일 부고장 열기
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                )}
              />
            )}
            {memo && <DetailRow label="안내" value={memo} />}
          </dl>

          <div className="mt-5 flex flex-wrap gap-4 px-4 text-sm text-gray-500 sm:px-5">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />경조사 안내</span>
            {event.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />장소 정보 포함</span>}
            {(event.contactNumber || obituaryDetails?.familyContact) && <span className="inline-flex items-center gap-1.5"><Phone className="size-4" aria-hidden="true" />연락처 안내</span>}
            <span className="inline-flex items-center gap-1.5"><UserRound className="size-4" aria-hidden="true" />동문 소식</span>
          </div>
        </article>
      </div>
    </div>
  );
}
