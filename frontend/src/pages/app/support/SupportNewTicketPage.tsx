import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { ArrowLeft, Send } from "lucide-react";

const PREFIX = "/app/support";

export function SupportNewTicketPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.createPlatformSupportTicket({
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      });
      navigate(`${PREFIX}/tickets/${r.id}`, { replace: true });
    } catch (err) {
      logApiError("createPlatformSupportTicket", err);
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6" data-page="platform-support-new">
      <div>
        <Link
          to={`${PREFIX}/tickets`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:underline mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">New support ticket</h1>
        <p className="text-sm text-text-secondary mt-0.5">Describe your issue — our team will respond in-thread.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Title</label>
          <input
            className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary"
            required
            maxLength={255}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Category</label>
            <select
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="general">General</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
              <option value="access">Access / users</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Priority</label>
            <select
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Description</label>
          <textarea
            className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm min-h-[160px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Steps to reproduce, impact, deadlines…"
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {submitting ? "Submitting…" : "Submit ticket"}
        </button>
      </form>
    </div>
  );
}
