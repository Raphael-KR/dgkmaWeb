import type { Node } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";

export const isTableCell = (type?: string) => type === "tableCell" || type === "tableHeader";

export function validTableCellAttributes(attrs: Record<string, unknown> | undefined) {
  const colspan = attrs?.colspan === undefined ? 1 : attrs.colspan;
  const rowspan = attrs?.rowspan === undefined ? 1 : attrs.rowspan;
  const widths = attrs?.colwidth;
  const align = attrs?.align;
  return (
    typeof colspan === "number" &&
    Number.isSafeInteger(colspan) &&
    colspan > 0 &&
    typeof rowspan === "number" &&
    Number.isSafeInteger(rowspan) &&
    rowspan > 0 &&
    (widths == null ||
      (Array.isArray(widths) &&
        widths.length === colspan &&
        widths.every((width) => Number.isSafeInteger(width) && width >= 0))) &&
    (align == null || (typeof align === "string" && ["left", "center", "right"].includes(align)))
  );
}

/** Bound virtual cells before the official TableMap allocates its grid. */
export function validPostTables(document: Node, cellBudget: number) {
  let valid = true;
  document.descendants((table) => {
    if (!valid) return false;
    if (table.type.name !== "table") return;
    const rows = table.childCount;
    let width = 0;
    table.firstChild!.forEach((cell) => {
      width += cell.attrs.colspan;
    });
    const cells = width * rows;
    if (!Number.isSafeInteger(cells) || cells <= 0 || cells > cellBudget) {
      valid = false;
      return false;
    }
    // Count row coverage without allocating the expanded grid. This also
    // bounds malformed rowspans before TableMap computes a table width.
    const spans = Array<number>(rows + 1).fill(0);
    let covered = 0;
    table.forEach((row, _offset, rowIndex) => {
      covered += spans[rowIndex];
      let rowWidth = 0;
      row.forEach((cell) => {
        const { colspan, rowspan } = cell.attrs;
        rowWidth += colspan;
        if (rowspan > rows - rowIndex) {
          valid = false;
        } else if (rowspan > 1) {
          spans[rowIndex + 1] += colspan;
          spans[rowIndex + rowspan] -= colspan;
        }
      });
      if (rowWidth + covered !== width) valid = false;
    });
    if (!valid) return false;
    cellBudget -= cells;
    if (TableMap.get(table).problems?.length) valid = false;
    return valid;
  });
  return valid;
}
