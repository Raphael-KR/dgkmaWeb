import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    개교: "bg-blue-100 text-blue-800",
    창립: "bg-green-100 text-green-800",
    학술: "bg-purple-100 text-purple-800",
    장학: "bg-yellow-100 text-yellow-800",
    확장: "bg-pink-100 text-pink-800",
    체계화: "bg-indigo-100 text-indigo-800",
    네트워크: "bg-cyan-100 text-cyan-800",
    국제화: "bg-red-100 text-red-800",
    봉사: "bg-orange-100 text-orange-800",
    디지털: "bg-teal-100 text-teal-800",
    혁신: "bg-violet-100 text-violet-800",
  }
  return colors[category] || "bg-gray-100 text-gray-800"
}
