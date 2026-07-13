import { useLocation } from "wouter";
import { COMMUNITY_EVENTS_SEO, useSeo } from "@/lib/seo";
import { EventComposer } from "./event-composer";
import { EventList } from "./event-list";

export default function CommunityEventsPage() {
  const [, setLocation] = useLocation();

  useSeo({ ...COMMUNITY_EVENTS_SEO.index, path: "/events" });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">경조사</h1>
        </header>

        <EventComposer />

        <div className="mt-3">
          <EventList onSelect={(id) => setLocation(`/events/${id}`)} />
        </div>
      </div>
    </div>
  );
}
