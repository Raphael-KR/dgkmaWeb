import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, MapPin, RefreshCw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { CommunityEventDetails, CommunityEventType } from "@shared/community-events";

export const EVENT_TYPE_LABELS: Record<CommunityEventType, string> = {
  obituary: "부고",
  wedding: "결혼",
  opening: "개원",
  other: "기타",
};

export type PublishedCommunityEvent = {
  id: number;
  eventType: CommunityEventType;
  title: string | null;
  eventDate: string | null;
  location: string | null;
  relatedMemberName: string | null;
  contactNumber: string | null;
  accountInfo: string | null;
  details: CommunityEventDetails;
};

type EventListProps = {
  selectedType: "all" | CommunityEventType;
  onSelect: (id: number) => void;
};

function eventListUrl(selectedType: EventListProps["selectedType"]) {
  return selectedType === "all" ? "/api/events" : `/api/events?type=${selectedType}`;
}

export function EventList({ selectedType, onSelect }: EventListProps) {
  const { data: events = [], isLoading, error, isFetching, refetch } = useQuery<PublishedCommunityEvent[]>({
    queryKey: ["/api/events", selectedType],
    queryFn: async () => {
      const response = await fetch(eventListUrl(selectedType), { credentials: "include" });
      if (!response.ok) {
        throw new Error("경조사 목록을 불러오지 못했습니다.");
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center" aria-label="경조사 목록을 불러오는 중">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 border-y border-red-100 px-4 text-center text-sm text-red-700">
        <p>경조사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="경조사 목록 다시 불러오기"
        >
          <RefreshCw className={isFetching ? "animate-spin" : undefined} aria-hidden="true" />
          다시 불러오기
        </Button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center border-y border-dashed border-gray-200 px-4 text-center text-sm text-gray-500">
        등록된 경조사가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <Card key={event.id} className="overflow-hidden shadow-sm">
          <button
            type="button"
            className="block w-full p-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900"
            onClick={() => onSelect(event.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Badge variant="outline">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
                <h3 className="break-words text-base font-semibold text-gray-900">
                  {event.title || "제목 없는 경조사"}
                </h3>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-gray-400" aria-hidden="true" />
            </div>

            <div className="space-y-2 pt-3 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="break-words">{event.eventDate || "일정 미정"}</span>
              </div>
              {event.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="break-words">{event.location}</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="break-words">{event.relatedMemberName || "관련 동문 미정"}</span>
              </div>
            </div>
          </button>
        </Card>
      ))}
    </div>
  );
}
