import { useQuery } from "@tanstack/react-query";
import { importedVideosPath, type ImportedVideo } from "@shared/contracts/imported-videos";
import { QueryError } from "@/components/query-error";

export function ImportedPostVideos({ postId }: { postId: number }) {
  const path = importedVideosPath(postId);
  const query = useQuery<ImportedVideo[]>({
    queryKey: [path],
    staleTime: 0,
    gcTime: 0,
  });
  if (query.isError) {
    return (
      <QueryError
        message="첨부 영상 목록을 불러오지 못했습니다."
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data?.length) return null;
  return (
    <div className="mt-6 space-y-4">
      {query.data.map((video, index) => (
        <video
          key={video.id}
          src={`${path}/${video.id}`}
          controls
          playsInline
          preload="none"
          className="w-full rounded-md"
          aria-label={`첨부 영상 ${index + 1}`}
        />
      ))}
    </div>
  );
}
