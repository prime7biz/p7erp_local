import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Landmark,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
} from "lucide-react";
import { api, type MeResponse } from "@/api/client";
import { useAiChatContext } from "@/context/AiChatContext";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { getCreateActions } from "@/components/shell/createActions";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";
import { pushNavRecent, type NavShortcut } from "@/components/shell/navShortcuts";
import { resolveTheme, setTheme, type ThemePreference } from "@/lib/theme";
import { logApiError } from "@/utils/logApiError";

const ATTENTION_BELL_CACHE_KEY = "p7_header_attention_bell";
const ATTENTION_BELL_CACHE_TTL_MS = 45_000;

function loadCachedBellCount(): number | null {
  try {
    const raw = sessionStorage.getItem(ATTENTION_BELL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: number; ts?: number };
    if (typeof parsed.ts !== "number" || typeof parsed.value !== "number") return null;
    if (Date.now() - parsed.ts > ATTENTION_BELL_CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function saveCachedBellCount(value: number): void {
  try {
    sessionStorage.setItem(ATTENTION_BELL_CACHE_KEY, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

function getNameInitial(name?: string | null) {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
}

function StakeholderPortalsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm text-text-secondary hover:bg-surface-subtle transition"
        aria-expanded={open}
      >
        <ExternalLink className="h-4 w-4" />
        <span className="hidden md:inline">Portals</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          <Link
            to="/login?role=customer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
          >
            <Users className="h-4 w-4 shrink-0 text-text-muted" />
            Customer portal
          </Link>
          <Link
            to="/login?role=financier"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
          >
            <Landmark className="h-4 w-4 shrink-0 text-text-muted" />
            Financier portal
          </Link>
          <div className="my-1 border-t border-border-subtle" />
          <Link
            to="/app/settings/external-access"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
          >
            <Settings className="h-4 w-4 shrink-0 text-text-muted" />
            Manage external access
          </Link>
        </div>
      )}
    </div>
  );
}

export function ShellTopHeader({
  me,
  displayName,
  onLogout,
  paletteRoutes,
}: {
  me: MeResponse;
  displayName: string;
  onLogout: () => void;
  paletteRoutes: FlatNavRoute[];
}) {
  const { setWidgetOpen } = useAiChatContext();
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemePreference>(() => resolveTheme());
  const [newOpen, setNewOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);

  const createActions = useMemo(
    () => getCreateActions({ tenantType: me.tenant_type, roleName: me.role_name }),
    [me.tenant_type, me.role_name],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (newRef.current && !newRef.current.contains(event.target as Node)) {
        setNewOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPalette = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (isPalette) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (!inField && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedBellCount();
    if (cached !== null) {
      setBellCount(cached);
      return () => {
        cancelled = true;
      };
    }
    api
      .getDashboardAttentionSummary()
      .then((summary) => {
        if (cancelled) return;
        const total =
          (summary.pending_approvals ?? 0) +
          (summary.critical_alerts ?? 0) +
          (summary.tna_overdue ?? 0);
        setBellCount(total);
        saveCachedBellCount(total);
      })
      .catch((e) => {
        logApiError("ShellTopHeader.bellCount", e);
        api
          .getDashboardKpis()
          .then((rows) => {
            if (cancelled) return;
            const pending = rows.find((k) => k.id === "pending-approvals")?.value ?? 0;
            const fallbackCount = typeof pending === "number" ? pending : Number(pending) || 0;
            setBellCount(fallbackCount);
            saveCachedBellCount(fallbackCount);
          })
          .catch((e2) => logApiError("ShellTopHeader.bellCountFallback", e2));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onPaletteNavigate = (entry: NavShortcut) => {
    pushNavRecent(me.user_id, entry);
  };

  return (
    <>
      <header className="flex h-12 items-center justify-between gap-3 border-b border-border bg-surface-raised px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-subtle px-2.5 text-sm text-text-muted transition hover:border-border-strong hover:bg-surface-base"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Search modules and pages…</span>
            <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
              Ctrl+K
            </kbd>
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="relative hidden md:block" ref={newRef}>
            <button
              type="button"
              onClick={() => setNewOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm text-text-secondary hover:bg-surface-subtle transition"
              aria-expanded={newOpen}
            >
              <Plus className="h-4 w-4" />
              New
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {newOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                {createActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      to={action.href}
                      onClick={() => setNewOpen(false)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
                    >
                      <Icon className="h-4 w-4 text-text-muted" />
                      {action.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          <StakeholderPortalsMenu />
          <button
            type="button"
            onClick={() => setWidgetOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle transition"
            title="Prime7 AI"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <Link
            to="/app/approvals"
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle transition"
            title="Approvals and alerts"
          >
            <Bell className="h-4 w-4" />
            {bellCount > 0 ? (
              <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold text-white">
                {bellCount > 99 ? "99+" : bellCount}
              </span>
            ) : null}
          </Link>
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="flex h-8 max-w-40 items-center gap-2 rounded-md px-2 text-left text-text-secondary hover:bg-surface-subtle transition"
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-semibold text-brand-primary">
                {getNameInitial(displayName)}
              </div>
              <span className="hidden truncate text-sm font-medium text-text-secondary sm:block">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
                <div className="border-b border-border-subtle px-2 py-1.5">
                  <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
                  <p className="truncate text-xs text-text-secondary">{me.email}</p>
                </div>
                <div className="border-b border-border-subtle px-2 py-1.5">
                  <p className="text-sm font-medium text-brand-primary">{me.tenant_name}</p>
                  <p className="text-xs text-text-muted">Company code: {me.company_code ?? "—"}</p>
                </div>
                <div className="space-y-0.5 pt-1">
                  <Link
                    to="/app/hr/ess/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <User className="h-4 w-4" />
                    My Profile
                  </Link>
                  <Link
                    to="/app/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const next: ThemePreference = theme === "dark" ? "light" : "dark";
                      setTheme(next);
                      setThemeState(next);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                </div>
                <div className="mt-1 border-t border-border-subtle pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-status-danger hover:bg-status-danger-subtle"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        routes={paletteRoutes}
        userId={me.user_id}
        onNavigate={onPaletteNavigate}
      />
    </>
  );
}
