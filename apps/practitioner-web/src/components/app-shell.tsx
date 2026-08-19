"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAVIGATION_SECTIONS, screenForPath } from "../lib/mef-authority";
import { MefIcon, type MefIconName } from "./mef-icons";

const iconForScreen: Record<string, MefIconName> = {
  "02-command-center": "command",
  "31-notifications": "bell",
  "32-audit-log": "audit",
  "03-imports-hub": "import",
  "09-trial-library": "trial",
  "14-session-queue": "session",
  "18-athlete-directory": "athlete",
  "21-evidence-library": "evidence",
  "24-references-hub": "reference",
  "28-report-library": "report",
  "30-agent-memory": "memory",
  "33-settings-workspace": "settings",
  "37-system-health": "health"
};

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [context, setContext] = useState<{ workspace_id: string; roles: string[] } | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const utilityRoute = pathname === "/login" || pathname === "/workspaces";
  const activeScreen = screenForPath(pathname);

  useEffect(() => {
    if (pathname === "/login") return;
    void fetch("/api/context", { credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<{ workspace_id: string; roles: string[] }> : null)
      .then((value) => setContext(value))
      .catch(() => setContext(null));
  }, [pathname]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        if (searchOpen) {
          event.preventDefault();
          closeSearch();
        } else if (railOpen) {
          event.preventDefault();
          closeRail();
        }
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [railOpen, searchOpen]);

  function closeRail() {
    setRailOpen(false);
    mobileMenuRef.current?.focus();
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    searchTriggerRef.current?.focus();
  }

  function trapSearchFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), a[href]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function signOut() {
    setSignOutError(null);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Sign-out could not be completed.");
      router.push("/login");
      router.refresh();
    } catch {
      setSignOutError("Sign-out could not be completed.");
    }
  }

  if (utilityRoute) return <><a className="mef-skip-link" href="#main-content">Skip to main content</a><main id="main-content">{children}</main></>;

  const navigationTargets = NAVIGATION_SECTIONS.flatMap((section) => section.items.map((screenId) => {
    const target = screenForPath(SCREEN_BY_ID_PLACEHOLDER(screenId));
    return { screenId, target };
  }));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = navigationTargets.filter(({ target }) => !normalizedSearch || `${target.title} ${target.area} ${target.capability}`.toLowerCase().includes(normalizedSearch));

  return (
    <div className={`mef-app-frame${railOpen ? " mef-rail-open" : ""}`}>
      <a className="mef-skip-link" href="#main-content">Skip to main content</a>
      <aside className="mef-rail" id="mef-navigation" aria-label="MEF navigation">
        <div className="mef-brand-lockup">
          <Link className="mef-brand-mark" href="/" aria-label="SportsAgentsLab MEF command center">M</Link>
          <div className="mef-brand-copy"><span>SportsAgentsLab</span><strong>MEF</strong></div>
        </div>
        <div className="mef-workspace-chip"><span className="mef-live-dot" aria-hidden="true" /><div><strong>{context?.workspace_id ?? "Preview workspace"}</strong><span>{context ? context.roles.join(" · ") : "Authentication required"}</span></div><MefIcon name="chevron" size={14} /></div>
        <nav className="mef-nav-list">
          {NAVIGATION_SECTIONS.map((section) => (
            <div className="mef-nav-group" key={section.label}>
              <p className="mef-nav-label">{section.label}</p>
              {section.items.map((screenId) => {
                const target = screenForPath(SCREEN_BY_ID_PLACEHOLDER(screenId));
                const active = activeScreen.id === screenId || (screenId === "24-references-hub" && (pathname.startsWith("/references") || pathname.startsWith("/protocols")));
                return <Link aria-label={target.title} className={`mef-nav-item${active ? " is-active" : ""}`} href={target.route} key={screenId} onClick={() => setRailOpen(false)} title={target.title}><span className="mef-nav-icon"><MefIcon name={iconForScreen[screenId]} size={17} /></span><span>{target.title}</span>{active ? <span className="mef-nav-active" aria-hidden="true" /> : null}</Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="mef-rail-footer"><Link href="/settings/health"><MefIcon name="health" size={16} />System health</Link><button className="mef-signout" type="button" onClick={() => void signOut()}><MefIcon name="close" size={16} />Sign out</button>{signOutError ? <span className="mef-rail-error" role="alert">{signOutError}</span> : null}</div>
      </aside>
      {railOpen ? <button aria-label="Close navigation" className="mef-rail-backdrop" type="button" onClick={closeRail} /> : null}
      <div className="mef-workbench">
        <header className="mef-topbar">
          <button ref={mobileMenuRef} aria-controls="mef-navigation" aria-expanded={railOpen} aria-label={railOpen ? "Close navigation" : "Open navigation"} className="mef-mobile-menu" type="button" onClick={() => railOpen ? closeRail() : setRailOpen(true)}><MefIcon name={railOpen ? "close" : "menu"} size={19} /></button>
          <div className="mef-topbar-title"><span>{activeScreen.area}</span><strong>{activeScreen.title}</strong></div>
          <button ref={searchTriggerRef} aria-expanded={searchOpen} aria-haspopup="dialog" aria-label="Search workspace" className="mef-topbar-search-action" type="button" onClick={() => setSearchOpen(true)}><MefIcon name="search" size={16} /><span>Search workspace</span><kbd>Ctrl K</kbd></button>
          <div className="mef-topbar-search"><MefIcon name="search" size={16} /><span>Search workspace</span><kbd>⌘ K</kbd></div>
          <div className="mef-topbar-actions"><Link className="mef-topbar-icon" href="/notifications" aria-label="Open notifications"><MefIcon name="bell" size={18} /><span className="mef-notification-dot" /></Link><Link className="mef-topbar-user" href="/settings"><span className="mef-avatar">{context ? "P" : "?"}</span><span><strong>Practitioner</strong><small>{context ? "Tenant scoped" : "Sign in required"}</small></span><MefIcon name="chevron" size={14} /></Link></div>
        </header>
        {searchOpen ? <div ref={searchDialogRef} aria-label="Search workspace" aria-modal="true" className="mef-search-popover" onKeyDown={trapSearchFocus} role="dialog"><div className="mef-search-popover-head"><MefIcon name="search" size={17} /><input autoFocus aria-label="Search screens" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search screens and work areas" value={searchQuery} /><button aria-label="Close workspace search" className="mef-search-close" type="button" onClick={closeSearch}><MefIcon name="close" size={16} /></button></div><div aria-label="Workspace screens" className="mef-search-results" role="listbox">{searchResults.length ? searchResults.map(({ screenId, target }) => <Link aria-label={`Open ${target.title}`} className="mef-search-result" href={target.route} key={screenId} onClick={closeSearch} role="option"><span className="mef-search-result-icon"><MefIcon name={iconForScreen[screenId]} size={16} /></span><span><strong>{target.title}</strong><small>{target.area} · {target.capability}</small></span><MefIcon name="arrow" size={14} /></Link>) : <p className="mef-search-empty">No governed screen matches that search.</p>}</div></div> : null}
        <main className="mef-main-column" id="main-content">{children}</main>
      </div>
    </div>
  );
}

function SCREEN_BY_ID_PLACEHOLDER(screenId: string) {
  const routes: Record<string, string> = {
    "02-command-center": "/",
    "31-notifications": "/notifications",
    "32-audit-log": "/audit",
    "03-imports-hub": "/imports",
    "09-trial-library": "/trials",
    "14-session-queue": "/sessions",
    "18-athlete-directory": "/athletes",
    "21-evidence-library": "/evidence",
    "24-references-hub": "/references",
    "28-report-library": "/reports",
    "30-agent-memory": "/assistant/memory",
    "33-settings-workspace": "/settings",
    "37-system-health": "/settings/health"
  };
  return routes[screenId] ?? "/";
}
