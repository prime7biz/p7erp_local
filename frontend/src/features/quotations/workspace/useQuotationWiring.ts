import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type {
  QuotationPrefillContext,
  QuotationWiringContext,
  WiringItemPriceHint,
} from "@/api/quotationWiring.types";
import { logApiError } from "@/utils/logApiError";

interface Input {
  /** Saved quotation id (0 / null while the quotation is still new). */
  quotationId: number | null | undefined;
  styleId: number | null | undefined;
  customerId: number | null | undefined;
  currency: string | null | undefined;
  /** Item ids of the material lines (any order; duplicates are fine). */
  materialItemIds: Array<number | null | undefined>;
}

/**
 * Read-only hints for the quotation costing screen (Phase 3 wiring).
 * Every call is best effort: a failure only hides the hint, it never blocks editing.
 */
export function useQuotationWiring({ quotationId, styleId, customerId, currency, materialItemIds }: Input) {
  const [prefill, setPrefill] = useState<QuotationPrefillContext | null>(null);
  const [wiring, setWiring] = useState<QuotationWiringContext | null>(null);
  const [hints, setHints] = useState<Record<number, WiringItemPriceHint>>({});

  useEffect(() => {
    if (!styleId) {
      setPrefill(null);
      return;
    }
    let cancelled = false;
    api
      .getQuotationPrefillContext({ style_id: styleId, customer_id: customerId || null, currency: currency || null })
      .then((r) => {
        if (!cancelled) setPrefill(r);
      })
      .catch((e) => {
        logApiError("QuotationWiring.prefill", e);
        if (!cancelled) setPrefill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [styleId, customerId, currency]);

  useEffect(() => {
    if (!quotationId) {
      setWiring(null);
      return;
    }
    let cancelled = false;
    api
      .getQuotationWiringContext(quotationId)
      .then((r) => {
        if (!cancelled) setWiring(r);
      })
      .catch((e) => {
        logApiError("QuotationWiring.wiring", e);
        if (!cancelled) setWiring(null);
      });
    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  // Stable key so typing in a price box does not re-fetch; only a changed item list does.
  const idsKey = useMemo(
    () =>
      Array.from(new Set(materialItemIds.filter((n): n is number => typeof n === "number" && n > 0)))
        .sort((a, b) => a - b)
        .join(","),
    [materialItemIds],
  );

  useEffect(() => {
    if (!idsKey) {
      setHints({});
      return;
    }
    let cancelled = false;
    api
      .getQuotationItemPriceHints(idsKey.split(",").map(Number), { currency: currency || null })
      .then((r) => {
        if (cancelled) return;
        const map: Record<number, WiringItemPriceHint> = {};
        for (const h of r.items) map[h.item_id] = h;
        setHints(map);
      })
      .catch((e) => {
        logApiError("QuotationWiring.priceHints", e);
        if (!cancelled) setHints({});
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, currency]);

  return { prefill, wiring, hints };
}
