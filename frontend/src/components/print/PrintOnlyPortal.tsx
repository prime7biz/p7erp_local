import { createPortal } from "react-dom";
import { usePrintIsolation } from "@/hooks/usePrintIsolation";
import "@/styles/document-print.css";

type Props = {
  children: React.ReactNode;
};

/** Renders children directly under <body>, hidden on screen and visible only when printing. */
export function PrintOnlyPortal({ children }: Props) {
  usePrintIsolation(true);
  return createPortal(
    <div data-p7-print-root className="vp-root p7-print-portal">
      {children}
    </div>,
    document.body,
  );
}
