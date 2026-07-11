import { useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMUNITY_EVENTS_SEO, useSeo } from "@/lib/seo";
import { EventComposer } from "./event-composer";
import { EVENT_TYPE_LABELS, EventList } from "./event-list";
import type { CommunityEventType } from "@shared/community-events";

type EventFilterType = "all" | CommunityEventType;

const eventFilters: Array<{ value: EventFilterType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "obituary", label: "부고" },
  { value: "wedding", label: "결혼" },
  { value: "opening", label: "개원" },
  { value: "other", label: "기타" },
];

function getInitialFilter(): EventFilterType {
  const type = new URLSearchParams(window.location.search).get("type");
  return eventFilters.some((filter) => filter.value === type) ? type as EventFilterType : "all";
}

export default function CommunityEventsPage() {
  const [, setLocation] = useLocation();
  const [selectedType, setSelectedType] = useState<EventFilterType>(getInitialFilter);

  useSeo({ ...COMMUNITY_EVENTS_SEO.index, path: "/events" });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">경조사</h1>
          <p className="mt-1 text-sm text-gray-500">동문들의 경조사 소식을 확인합니다.</p>
        </header>

        <EventComposer />

        <Tabs value={selectedType} onValueChange={(value) => setSelectedType(value as EventFilterType)} className="mt-5">
          <TabsList className="grid h-10 w-full grid-cols-5">
            {eventFilters.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value} className="min-w-0 px-1 text-sm">
                {filter.value === "all" ? filter.label : EVENT_TYPE_LABELS[filter.value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4">
          <EventList selectedType={selectedType} onSelect={(id) => setLocation(`/events/${id}`)} />
        </div>
      </div>
    </div>
  );
}
