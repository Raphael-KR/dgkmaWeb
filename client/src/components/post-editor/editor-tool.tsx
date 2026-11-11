import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function EditorTool({ label, active, disabled, onClick, children }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "h-8 min-w-8 rounded px-2 text-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 disabled:pointer-events-none",
        active ? "bg-blue-100 text-blue-800" : "text-gray-700",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
