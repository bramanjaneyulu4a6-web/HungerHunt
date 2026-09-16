const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

/* Fired on window when the backend reports that something changed. It carries
 * no detail: it means "refetch what you show", and each screen that wants to
 * stay live subscribes with one addEventListener and calls its own loader. */
export const DATA_CHANGED_EVENT = "hungerhunt:data-changed";

let observedRevision = null;

export const observeMutationRevision = (response) => {
  const method = String(response?.config?.method || "").toLowerCase();
  const revision = response?.headers?.["x-data-revision"];
  if (MUTATING_METHODS.has(method) && revision != null) {
    observedRevision = String(revision);
  }
  return response;
};

/* Polls a data-free backend revision rather than every business endpoint,
 * and announces a change on window for screens to refetch in place.
 *
 * This used to reload the page. A reload threw away scroll position, open
 * dialogs and half-typed forms on every open screen in the school each time
 * anybody, anywhere, wrote anything — several times a minute during a break.
 * Nothing here touches window.location any more.
 *
 * A hidden tab does not poll; the moment it is visible again it checks once,
 * so several changes while it was hidden become one refetch. */
export const startDataAutoRefresh = (api, {
  enabled = () => true,
  intervalMs = 4_000,
} = {}) => {
  let stopped = false;
  let checking = false;

  const check = async () => {
    if (stopped || checking || !enabled()) return;
    if (document.visibilityState !== "visible") return;
    checking = true;
    try {
      const before = observedRevision;
      const response = await api.get("/data-revision", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      const next = String(response.data.revision);
      observedRevision = next;
      if (before != null && before !== next) {
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
      }
    } catch {
      // Offline and backend restarts are normal transient states; the next
      // successful check catches up.
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
