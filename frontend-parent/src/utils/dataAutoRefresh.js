const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

let observedRevision = null;
let pendingRefresh = false;

export const observeMutationRevision = (response) => {
  const method = String(response?.config?.method || "").toLowerCase();
  const revision = response?.headers?.["x-data-revision"];
  if (MUTATING_METHODS.has(method) && revision != null) {
    observedRevision = String(revision);
  }
  return response;
};

const userIsEditing = () => {
  const active = document.activeElement;
  const editing = active && (
    ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
    active.isContentEditable
  );
  const overlay = document.querySelector(
    '[role="dialog"], .modal, .modal-backdrop, .wh-dialog-backdrop, .wh-sheet'
  );
  return Boolean(editing || overlay);
};

/* Polls a data-free backend revision rather than every business endpoint.
 * Reloading is deferred while somebody is typing or working in a dialog, so
 * automatic freshness cannot discard an in-progress form. */
export const startDataAutoRefresh = (api, {
  enabled = () => true,
  pauseWhen = () => false,
  intervalMs = 4_000,
} = {}) => {
  let stopped = false;
  let checking = false;

  const refreshIfSafe = () => {
    if (document.visibilityState !== "visible" || userIsEditing() || pauseWhen()) {
      pendingRefresh = true;
      return;
    }
    window.location.reload();
  };

  const check = async () => {
    if (stopped || checking || !enabled()) return;
    checking = true;
    try {
      const before = observedRevision;
      const response = await api.get("/data-revision", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      const next = String(response.data.revision);
      observedRevision = next;
      if ((before != null && before !== next) || pendingRefresh) refreshIfSafe();
    } catch {
      // Offline and backend restarts are normal transient states; the next
      // successful check catches up without replacing a useful screen.
    } finally {
      checking = false;
    }
  };

  const interval = window.setInterval(check, intervalMs);
  const onFocus = () => check();
  const onVisibility = () => { if (document.visibilityState === "visible") check(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  check();

  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
};

