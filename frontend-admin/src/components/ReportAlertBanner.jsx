import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/api";
import { Banner } from "./ui";

/* Unanswered caretaker reports, in front of every admin on every screen.
 *
 * There is no owner and no assignment: the queue belongs to all of them, and
 * any one of them can answer anything in it. That only works if nobody has to
 * remember to go and look — nothing else in this system tells staff a report
 * exists. No email, no push; staff accounts have no notification channel at
 * all. Without this banner a complaint sits at OPEN until somebody happens to
 * open the right page, and a caretaker who is met with silence twice stops
 * writing, including the time it mattered.
 *
 * So it is not dismissible, for the same reason the stock banner is not:
 * closing it would not answer anybody. It disappears when the queue is empty.
 *
 * A failed poll keeps the last good answer on screen — a person waiting must
 * not blink out of view because the network hiccuped. */

const POLL_MS = 60_000;

const waitingFor = (raisedAt) => {
  const days = Math.floor((Date.now() - new Date(raisedAt).getTime()) / 86_400_000);
  if (days >= 1) return `the oldest for ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor((Date.now() - new Date(raisedAt).getTime()) / 3_600_000);
  return hours >= 1 ? `the oldest for ${hours} hour${hours === 1 ? "" : "s"}` : "the oldest just now";
};

export default function ReportAlertBanner() {
  const [queue, setQueue] = useState(null); // null = not loaded yet

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // limit=1 because the count is the message; the one row it does return
        // is the oldest waiting, which is how long somebody has gone unanswered.
        const res = await api.get("/v1/reports?status=OUTSTANDING&limit=1");
        if (cancelled) return;
        setQueue({
          outstanding: res.data?.meta?.outstanding || 0,
          oldest: res.data?.data?.[0] || null,
        });
      } catch (err) {
        console.error(err);
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!queue || queue.outstanding === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <Banner variant="warn" icon="✎">
        <strong>
          {queue.outstanding === 1
            ? "1 caretaker report is waiting for an answer"
            : `${queue.outstanding} caretaker reports are waiting for an answer`}
        </strong>
        {queue.oldest ? ` — ${waitingFor(queue.oldest.raisedAt)}` : ""} —{" "}
        <Link to="/reports">read and reply</Link>
      </Banner>
    </div>
  );
}
