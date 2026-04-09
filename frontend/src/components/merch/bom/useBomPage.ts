import { useCallback, useState } from "react";
import {
  api,
  type OrderDrivenBomDetailResponse,
  type OrderDrivenBomLineCreate,
  type OrderDrivenBomLinePatch,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useBomPage() {
  const [detail, setDetail] = useState<OrderDrivenBomDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearFlash = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  const refreshDetail = useCallback(async (bomId: number) => {
    const d = await api.getOrderDrivenBomDetail(bomId);
    setDetail(d);
    return d;
  }, []);

  const loadByOrderId = useCallback(async (orderId: number) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.getOrderDrivenBomByOrder(orderId);
      setDetail(d);
      setSuccess("BOM loaded.");
    } catch (e) {
      logApiError("useBomPage.loadByOrderId", e);
      setDetail(null);
      setError(e instanceof Error ? e.message : "Could not load BOM for this order");
    } finally {
      setLoading(false);
    }
  }, []);

  const createFromOrder = useCallback(async (orderId: number) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.createBomFromOrder(orderId);
      setDetail(d);
      setSuccess("BOM created from quotation materials.");
    } catch (e) {
      logApiError("useBomPage.createFromOrder", e);
      setError(e instanceof Error ? e.message : "Failed to create BOM");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLine = useCallback(
    async (bomId: number, lineId: number, patch: OrderDrivenBomLinePatch) => {
      setError("");
      try {
        await api.patchOrderDrivenBomLine(bomId, lineId, patch);
        await refreshDetail(bomId);
        setSuccess("Line saved.");
      } catch (e) {
        logApiError("useBomPage.updateLine", e);
        setError(e instanceof Error ? e.message : "Failed to update line");
        throw e;
      }
    },
    [refreshDetail],
  );

  const addLine = useCallback(
    async (bomId: number, body: OrderDrivenBomLineCreate) => {
      setError("");
      try {
        await api.addOrderDrivenBomLine(bomId, body);
        await refreshDetail(bomId);
        setSuccess("Line added.");
      } catch (e) {
        logApiError("useBomPage.addLine", e);
        setError(e instanceof Error ? e.message : "Failed to add line");
        throw e;
      }
    },
    [refreshDetail],
  );

  const deleteLine = useCallback(
    async (bomId: number, lineId: number) => {
      setError("");
      try {
        await api.deleteOrderDrivenBomLine(bomId, lineId);
        await refreshDetail(bomId);
        setSuccess("Line removed.");
      } catch (e) {
        logApiError("useBomPage.deleteLine", e);
        setError(e instanceof Error ? e.message : "Failed to delete line");
        throw e;
      }
    },
    [refreshDetail],
  );

  const submit = useCallback(async (bomId: number) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.submitOrderDrivenBom(bomId);
      setDetail(d);
      setSuccess("BOM submitted.");
    } catch (e) {
      logApiError("useBomPage.submit", e);
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (bomId: number) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.approveOrderDrivenBom(bomId);
      setDetail(d);
      setSuccess("BOM approved.");
    } catch (e) {
      logApiError("useBomPage.approve", e);
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const reject = useCallback(async (bomId: number, comment: string) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.rejectOrderDrivenBom(bomId, comment);
      setDetail(d);
      setSuccess("BOM rejected — returned to draft.");
    } catch (e) {
      logApiError("useBomPage.reject", e);
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const freeze = useCallback(async (bomId: number) => {
    setLoading(true);
    setError("");
    try {
      const d = await api.freezeOrderDrivenBom(bomId);
      setDetail(d);
      setSuccess("BOM frozen.");
    } catch (e) {
      logApiError("useBomPage.freeze", e);
      setError(e instanceof Error ? e.message : "Freeze failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkPos = useCallback(async (bomId: number, lineIds?: number[]) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.bulkGeneratePurchaseOrdersFromOrderBom(bomId, lineIds);
      await refreshDetail(bomId);
      setSuccess(`Created ${res.created.length} draft PO(s).`);
    } catch (e) {
      logApiError("useBomPage.bulkPos", e);
      setError(e instanceof Error ? e.message : "Bulk PO failed");
    } finally {
      setLoading(false);
    }
  }, [refreshDetail]);

  return {
    detail,
    setDetail,
    loading,
    error,
    success,
    setError,
    setSuccess,
    clearFlash,
    refreshDetail,
    loadByOrderId,
    createFromOrder,
    updateLine,
    addLine,
    deleteLine,
    submit,
    approve,
    reject,
    freeze,
    bulkPos,
  };
}
