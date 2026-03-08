import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface NotificationEvent {
  type: string;
  title?: string;
  message?: string;
  entityType?: string;
  entityId?: number;
  timestamp?: string;
}

export function useNotificationStream(enabled: boolean) {
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 10;

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/workflow-tasks/notifications/stream", {
        withCredentials: true,
      });

      es.onmessage = (event) => {
        try {
          const data: NotificationEvent = JSON.parse(event.data);

          if (data.type === "connected") {
            retryCountRef.current = 0;
            return;
          }

          if (data.type === "notification" && data.title) {
            toast({
              title: data.title,
              description: data.message || "",
            });

            queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications/unread-count"] });
            queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications"] });
          }
        } catch {
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
          retryCountRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      eventSourceRef.current = es;
    } catch {
    }
  }, [enabled, toast]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);
}
