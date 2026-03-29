import { useCallback, useState } from "react";
import { api, type AiApprovalArtifactResponse } from "@/api/client";

/**
 * List and drive approval artifacts (draft review before ERP commit).
 */
export function useAiApprovalArtifacts() {
  const [items, setItems] = useState<AiApprovalArtifactResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async (params?: { status?: string; limit?: number }) => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.aiListArtifacts(params);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load artifacts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getArtifact = useCallback(async (artifactId: number) => {
    setError("");
    try {
      return await api.aiGetArtifact(artifactId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load artifact");
      return null;
    }
  }, []);

  const wrapMutate = useCallback(
    async <T>(artifactId: number, fn: () => Promise<T>): Promise<T | null> => {
      setMutatingId(artifactId);
      setError("");
      try {
        return await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        return null;
      } finally {
        setMutatingId(null);
      }
    },
    []
  );

  const approveArtifact = useCallback(
    (artifactId: number, comments?: string | null) =>
      wrapMutate(artifactId, () => api.aiApproveArtifact(artifactId, { comments })),
    [wrapMutate]
  );

  const rejectArtifact = useCallback(
    (artifactId: number, comments?: string | null) =>
      wrapMutate(artifactId, () => api.aiRejectArtifact(artifactId, { comments })),
    [wrapMutate]
  );

  const commitArtifact = useCallback(
    (artifactId: number) => wrapMutate(artifactId, () => api.aiCommitArtifact(artifactId)),
    [wrapMutate]
  );

  const rollbackArtifact = useCallback(
    (artifactId: number, reason: string) =>
      wrapMutate(artifactId, () => api.aiRollbackArtifact(artifactId, { reason })),
    [wrapMutate]
  );

  const clearError = useCallback(() => setError(""), []);

  return {
    items,
    loading,
    mutatingId,
    error,
    clearError,
    refresh,
    getArtifact,
    approveArtifact,
    rejectArtifact,
    commitArtifact,
    rollbackArtifact,
    setItems,
  };
}
