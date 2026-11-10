import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  variant?: "ring" | "arc";
  className?: string;
}

export function LoadingSpinner({
  size = "medium",
  variant = "ring",
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: "w-4 h-4",
    medium: "w-6 h-6",
    large: "w-8 h-8",
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div
        className={cn(
          "animate-spin rounded-full",
          variant === "arc" ? "border-b-2" : "border-2 border-gray-300",
          sizeClasses[size],
        )}
      />
    </div>
  );
}
