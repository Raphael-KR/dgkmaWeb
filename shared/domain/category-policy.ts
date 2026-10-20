export const POST_CATEGORY_NAMES = ["notice", "free", "event", "news"] as const;

const POST_CATEGORY_NAME_SET = new Set<string>(POST_CATEGORY_NAMES);

export type SelectablePostCategory = {
  name: string;
  isActive?: boolean | null;
};

export function isSelectablePostCategory(
  category: SelectablePostCategory | null | undefined,
): boolean {
  return category?.isActive === true && POST_CATEGORY_NAME_SET.has(category.name);
}
