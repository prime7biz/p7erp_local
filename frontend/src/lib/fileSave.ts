/**
 * Save a file built in the browser (CSV, Excel, PDF, ZIP …) so it also works on phones.
 *
 * - Desktop and Android: a normal download through a hidden link.
 * - iPhone / iPad: the share sheet ("Save to Files"), because many iOS browsers and in-app
 *   browsers ignore the download attribute. If sharing is not possible we fall back to a
 *   download, and finally to opening the file in a new tab.
 *
 * Use this only for files the user saves. Image previews keep their own object URLs.
 */

export type SaveBlobResult = "downloaded" | "shared" | "opened" | "cancelled";

/** Object URLs stay alive this long; mobile browsers start downloads late. */
export const OBJECT_URL_LIFETIME_MS = 60_000;

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

export function isAppleMobileDevice(nav: NavigatorLike | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

function supportsAnchorDownload(): boolean {
  return typeof document !== "undefined" && "download" in document.createElement("a");
}

function makeFile(blob: Blob, filename: string): File | null {
  try {
    return new File([blob], filename, { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function scheduleRevoke(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

function anchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  scheduleRevoke(url);
}

function openInNewTab(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.opener = null;
  } else {
    // Pop-up blocked: show the file in this tab so the user can still save it.
    window.location.assign(url);
  }
  scheduleRevoke(url);
  return true;
}

async function tryShare(blob: Blob, filename: string, nav: NavigatorLike): Promise<SaveBlobResult | null> {
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return null;
  const file = makeFile(blob, filename);
  if (!file) return null;
  let canShareFile = false;
  try {
    canShareFile = nav.canShare({ files: [file] });
  } catch {
    canShareFile = false;
  }
  if (!canShareFile) return null;
  try {
    await nav.share({ files: [file], title: filename });
    return "shared";
  } catch (err) {
    if (isAbortError(err)) return "cancelled";
    // NotAllowedError (no recent tap) or any other failure: fall back to a download.
    return null;
  }
}

export async function saveBlob(blob: Blob, filename: string): Promise<SaveBlobResult> {
  const nav = globalThis.navigator as NavigatorLike | undefined;
  if (nav && isAppleMobileDevice(nav)) {
    const shared = await tryShare(blob, filename, nav);
    if (shared) return shared;
  }
  if (supportsAnchorDownload()) {
    anchorDownload(blob, filename);
    return "downloaded";
  }
  openInNewTab(blob);
  return "opened";
}

/** Build a text file (CSV, JSON, Markdown …) and save it. */
export function saveTextFile(content: string, filename: string, mimeType = "text/plain;charset=utf-8") {
  return saveBlob(new Blob([content], { type: mimeType }), filename);
}

/**
 * Show a PDF in a new tab (handy for printing). Phones and blocked pop-ups fall back to
 * saving it, so the user always gets the file.
 */
export async function openOrSaveBlob(blob: Blob, filename: string): Promise<SaveBlobResult> {
  const nav = globalThis.navigator as NavigatorLike | undefined;
  if (blob.type === "application/pdf" && !(nav && isAppleMobileDevice(nav))) {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.opener = null;
      scheduleRevoke(url);
      return "opened";
    }
    URL.revokeObjectURL(url);
  }
  return saveBlob(blob, filename);
}
