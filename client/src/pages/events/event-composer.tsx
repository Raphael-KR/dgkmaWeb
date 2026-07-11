import { FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EVENT_TYPE_LABELS } from "./event-list";
import type { CommunityEventType } from "@shared/community-events";

type EventComposerProps = {
  selectedType: CommunityEventType;
};

const eventTypes: CommunityEventType[] = ["obituary", "wedding", "opening", "other"];

export function EventComposer({ selectedType }: EventComposerProps) {
  return (
    <section className="w-full border-y border-gray-200 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">경조사 등록</h2>
          <p className="mt-1 text-sm text-gray-500">등록 기능 준비 중</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label>유형</Label>
          <ToggleGroup
            type="single"
            value={selectedType}
            disabled
            aria-label="경조사 유형"
            className="mt-2 grid w-full grid-cols-4 gap-1"
          >
            {eventTypes.map((eventType) => (
              <ToggleGroupItem
                key={eventType}
                value={eventType}
                aria-label={EVENT_TYPE_LABELS[eventType]}
                className="h-9 w-full px-2 text-sm"
              >
                {EVENT_TYPE_LABELS[eventType]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div>
          <Label htmlFor="event-source">경조사 원문</Label>
          <Textarea
            id="event-source"
            disabled
            className="mt-2 min-h-[96px] resize-none"
            placeholder="등록 기능 준비 중"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" disabled className="h-auto min-h-10 whitespace-normal py-2">
            <FileText aria-hidden="true" />
            경조사 내용 불러오기 (등록 기능 준비 중)
          </Button>
          <Button type="button" disabled className="h-auto min-h-10 whitespace-normal py-2">
            <Send aria-hidden="true" />
            게시 (등록 기능 준비 중)
          </Button>
        </div>
      </div>
    </section>
  );
}
