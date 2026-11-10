import type { HeritagePhoto } from "@shared/heritage/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PhotoViewer({ photo, albumTitle }: { photo: HeritagePhoto; albumTitle: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${photo.caption} 크게 보기`}
        >
          <img
            src={photo.src}
            alt={photo.caption}
            loading="lazy"
            decoding="async"
            className="heritage-album-cover"
          />
          <p className="heritage-meta mt-2 group-hover:underline">{photo.caption}</p>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto">
        <DialogTitle className="pr-6">{albumTitle}</DialogTitle>
        <DialogDescription>{photo.caption}</DialogDescription>
        <img
          src={photo.src}
          alt={photo.caption}
          decoding="async"
          className="max-h-[65vh] w-full object-contain"
        />
        {photo.credit && <p className="heritage-meta">사진 제공: {photo.credit}</p>}
      </DialogContent>
    </Dialog>
  );
}
