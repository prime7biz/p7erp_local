import { useEffect } from "react";

const ISOLATE_CLASS = "p7-print-isolate";
let isolateUsers = 0;

/**
 * While active, printing shows only elements marked `data-p7-print-root`
 * (direct children of <body>); the app shell under #root is hidden.
 * Rules live in `styles/document-print.css`.
 */
export function usePrintIsolation(active: boolean) {
  useEffect(() => {
    if (!active) return;
    isolateUsers += 1;
    document.body.classList.add(ISOLATE_CLASS);
    return () => {
      isolateUsers -= 1;
      if (isolateUsers <= 0) {
        isolateUsers = 0;
        document.body.classList.remove(ISOLATE_CLASS);
      }
    };
  }, [active]);
}
