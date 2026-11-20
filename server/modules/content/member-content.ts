// The browser needs ownership for controls. Authorization still uses the session on every write.
export function memberContent<T extends { authorId: string | null }>(
  { authorId, ...content }: T,
  viewerId: string,
) {
  return { ...content, isAuthor: authorId === viewerId };
}
