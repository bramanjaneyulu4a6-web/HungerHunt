/* The pause between payment status polls.
 *
 * A plain setTimeout is wrong for one case that matters here: iOS freezes
 * the WebView's timers while the parent is off in their UPI app, and on
 * return the pending timer resumes with whatever time it had left. That
 * leaves the parent staring at "Checking with the bank…" for up to a full
 * poll interval at the exact moment the answer is most likely ready. So the
 * wait also listens for the page becoming visible again and releases
 * immediately — the caller polls the instant the app is back in the
 * foreground. (Android mostly returns via the plugin's activity result
 * before polling starts, but the hosted-checkout Custom Tab and the web
 * build get the same instant catch-up for free.)
 *
 * Resolves, never rejects: on the timer, on abort, or on resume. Callers
 * treat all three as "check now / decide whether to stop". Guarded so the
 * util also runs under Node, which has no document. */
export const wait = (ms, signal) =>
  new Promise((resolve) => {
    const doc = typeof document === 'undefined' ? null : document;

    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      doc?.removeEventListener('visibilitychange', onVisibilityChange);
      resolve();
    };

    const onVisibilityChange = () => {
      if (doc.visibilityState === 'visible') done();
    };

    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    doc?.addEventListener('visibilitychange', onVisibilityChange);
  });
