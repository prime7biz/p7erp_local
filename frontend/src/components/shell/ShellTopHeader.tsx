import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Keyboard,
  ExternalLink,
  Landmark,
  LogOut,
  PenLine,
  Plus,
  Search,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import type { MeResponse } from "@/api/client";
import { useAiChatContext } from "@/context/AiChatContext";
import { BellPanel } from "@/components/shell/BellPanel";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { PageHelpButton } from "@/components/shell/PageHelpButton";
import { ShortcutSheet } from "@/components/shell/ShortcutSheet";
import { getCreateActions } from "@/components/shell/createActions";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";
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
  const [newOpen, setNewOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
        return;
      }
      if (!inField && e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="no-print flex h-12 items-center justify-between gap-2 border-b border-border bg-surface-raised px-3 sm:gap-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface-subtle px-2.5 text-sm text-text-muted transition hover:border-border-strong hover:bg-surface-base"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Search pages, orders, customers…</span>
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
                {createActions.filter((a) => !a.paletteOnly).map((action) => {
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
          <PageHelpButton />
          <button
            type="button"
            onClick={() => setWidgetOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle transition"
            title="Prime7 AI"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-subtle lg:flex"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <BellPanel />
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
              <div className="absolute right-0 z-20 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
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
                    to="/app/my-signature"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <PenLine className="h-4 w-4" />
                    My Signature
                  </Link>
                  <Link
                    to="/app/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
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
        createActions={createActions}
        userId={me.user_id}
      />
      <ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
