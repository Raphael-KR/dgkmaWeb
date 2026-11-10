import { useEffect } from "react";

/** Use only for pages that already reset scroll on mount, without anchor handling. */
export function useScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
}
