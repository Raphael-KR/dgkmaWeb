export type ImportedVideo = { id: string };

export function importedVideosPath(postId: number | ":id") {
  return `/api/posts/${postId}/imported-videos`;
}
