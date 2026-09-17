/* Reloads an open tab once a newer build of this app has been deployed.
 *
 * The data-revision poll used to reload the page, and that was, by accident,
 * how an open tab picked up a new deploy. That reload is gone: data changes
 * are announced and refetched in place (dataAutoRefresh.js), and nothing here
 * listens to them. This is the deliberate replacement for the other half —
 * a signal about code, not data.
 *
 * The build bakes a stamp into the bundle (import.meta.env.VITE_BUILD_STAMP)
 * and serves the same stamp at /version.json; see
 * scripts/versionStampPlugin.mjs. A stamp that differs means another build is
 * live. The reload then waits for a moment it cannot cost anybody anything:
 * the tab visible, nothing being typed, no dialog open, and whatever the app
 * adds through canReload. Until then it retries on a short local clock that
 * makes no request.
 *
 * Native shells (the store app, the sideloaded APKs) serve version.json out
 * of their own bundle, so it can never differ; the watcher does not start
 * there, nor without a stamp (the dev server and tests). */

export const DEPLOY_RELOAD_KEY = "hungerhunt:deploy-reload";

const OVERLAY_SELECTOR =
  '[role="dialog"], .modal, .modal-backdrop, .wh-dialog-backdrop, .wh-sheet';

let pendingStamp = null;

export const stampOf = (version) => {
  const commit = version?.commit;
  const builtAt = version?.builtAt;
  if (typeof commit !== "string" || !commit) return null;
  if (typeof builtAt !== "string" || !builtAt) return null;
  return `${commit}@${builtAt}`;
};

const isNativeShell = () => Boolean(window.Capacitor?.isNativePlatform?.());

const isVisible = () => document.visibilityState === "visible";

const userIsEditing = () => {
  const active = document.activeElement;
  const editing = active && (
    ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
    active.isContentEditable
  );
  return Boolean(editing || document.querySelector(OVERLAY_SELECTOR));
};

const readGuard = () => {
  try {
    return window.sessionStorage.getItem(DEPLOY_RELOAD_KEY);
  } catch {
    return null;
  }
};

const writeGuard = (stamp) => {
  try {
    window.sessionStorage.setItem(DEPLOY_RELOAD_KEY, stamp);
  } catch {
    // Without storage there is no guard; a reloaded page makes no check for a
    // whole interval, so the worst case is one reload per interval.
  }
};

/* One reload per build per tab. If a CDN ever served the new version.json
   beside the old index.html, the reloaded page would still be the old build
   and would otherwise reload again straight away, for ever. */
const reloadFor = (stamp) => {
  if (readGuard() === stamp) return false;
  writeGuard(stamp);
  window.location.reload();
  return true;
};

/* For the end of a kiosk order session: the moment it ends, anything on
   screen belonged to it, so only visibility and the loop guard apply. */
export const reloadIfDeployPending = () => {
  if (!pendingStamp || !isVisible()) return false;
  return reloadFor(pendingStamp);
};

export const startDeployWatch = ({
  bakedStamp,
  canReload = () => true,
  intervalMs = 300_000,
  retryMs = 15_000,
} = {}) => {
  if (!bakedStamp || isNativeShell()) return () => {};

  let stopped = false;
  let checking = false;

  const attemptReload = () => {
    if (stopped || !pendingStamp) return;
    if (!isVisible() || userIsEditing() || !canReload()) return;
    reloadFor(pendingStamp);
  };

  const check = async () => {
    if (stopped || checking || !isVisible()) return;
    checking = true;
    try {
      const response = await window.fetch(`/version.json?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const deployed = stampOf(await response.json());
        if (deployed === bakedStamp) pendingStamp = null;
        else if (deployed) pendingStamp = deployed;
      }
    } catch {
      // Offline, a deploy mid-flight, an HTML error page: the next check
      // tries again.
    } finally {
      checking = false;
    }
    attemptReload();
  };

  // No check now: a page that has just loaded is the current build.
  const checkTimer = window.setInterval(check, intervalMs);
  const retryTimer = window.setInterval(attemptReload, retryMs);
  const onFocus = () => check();
  const onVisibility = () => { if (isVisible()) check(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    window.clearInterval(checkTimer);
    window.clearInterval(retryTimer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
