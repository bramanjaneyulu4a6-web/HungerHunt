import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/api";
import { Banner } from "./ui";

/* The notification that cannot be dismissed, because dismissing it would not
 * put stock on the shelf. Rendered by Layout across the whole /warehouse
 * workspace, it polls the alerts feed and names every product that is out
 * of stock (and therefore off sale) or below its reorder level. There is no
 * close button on purpose: the banner *is* the state of the shelf, and it
 * disappears the moment a receipt or adjustment refills the last empty item.
 *
 * A failed poll keeps the last good answer on screen — a network blip must
 * not blink a real stock-out away. */

const POLL_MS = 60_000;
const NAMED_LIMIT = 8;

const nameList = (entries) => {
  const named = entries.slice(0, NAMED_LIMIT).map((e) => e.name);
  const more = entries.length - named.length;
  return named.join(" · ") + (more > 0 ? ` · and ${more} more` : "");
};

export default function StockAlertBanner() {
  const [alerts, setAlerts] = useState(null); // null = not loaded yet

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get("/inventory/alerts");
        if (cancelled) return;
        if (res.data && Array.isArray(res.data.outOfStock) && Array.isArray(res.data.low)) {
          setAlerts(res.data);
        }
      } catch (err) {
        // Keep showing the last known state; a stock-out doesn't clear
        // because the network hiccuped.
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

  if (!alerts || (alerts.outOfStock.length === 0 && alerts.low.length === 0)) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {alerts.outOfStock.length > 0 && (
        <Banner variant="alert" icon="⛔️">
          <strong>
            {alerts.outOfStock.length === 1
              ? "1 product is out of stock and off sale"
              : `${alerts.outOfStock.length} products are out of stock and off sale`}
            :
          </strong>{" "}
          {nameList(alerts.outOfStock)} —{" "}
          <Link to="/warehouse/inventory?filter=out">view and replenish</Link>
        </Banner>
      )}
      {alerts.low.length > 0 && (
        <Banner variant="warn" icon="⚠️">
          <strong>
            {alerts.low.length === 1
              ? "1 product is below its reorder level"
              : `${alerts.low.length} products are below their reorder level`}
            :
          </strong>{" "}
          {alerts.low.map((e) => `${e.name} (${e.stock}/${e.reorderLevel})`).slice(0, NAMED_LIMIT).join(" · ")}
          {alerts.low.length > NAMED_LIMIT ? ` · and ${alerts.low.length - NAMED_LIMIT} more` : ""} —{" "}
          <Link to="/warehouse/inventory?filter=low">view</Link>
        </Banner>
      )}
    </div>
  );
}
