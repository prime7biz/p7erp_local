import type { MerchAlertItem } from "@/api/client";

/** Primary app route for the alert's main record (orders, quotations, trade, commercial). */
export function merchAlertPrimaryHref(
  alert: Pick<MerchAlertItem, "entity_type" | "entity_id" | "order_id">,
): string | null {
  const et = (alert.entity_type || "").toLowerCase();
  const eid = alert.entity_id;
  if (eid == null && alert.order_id != null) {
    return `/app/orders/${alert.order_id}`;
  }
  if (eid == null) {
    return null;
  }
  switch (et) {
    case "order":
      return `/app/orders/${eid}`;
    case "quotation":
      return `/app/quotations/${eid}`;
    case "followup":
      return alert.order_id != null ? `/app/orders/${alert.order_id}` : `/app/followup`;
    case "followup_action":
      return alert.order_id != null ? `/app/orders/${alert.order_id}` : `/app/tna/plans`;
    case "trade_case":
      return `/app/trade/cases/${eid}`;
    case "shipment":
      return alert.order_id != null ? `/app/trade/cases` : `/app/trade/dashboard`;
    case "master_contract":
      return `/app/commercial/master-contracts`;
    case "btb_lc":
      return `/app/commercial/btb-lcs`;
    default:
      return alert.order_id != null ? `/app/orders/${alert.order_id}` : null;
  }
}
