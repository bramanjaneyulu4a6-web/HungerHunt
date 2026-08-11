# Admin Inventory & Ordering Repair — Design

Date: 2026-08-11
Status: Approved (pending user review of this document)
Scope: backend + frontend-admin, with narrow read-path changes in hungerhunt-kiosk and the admin Billing screen where they consume the same data.

## Why

A read of the admin catalogue → ordering → receiving → inventory path end to end found four correctness holes and five gaps:

- **A.** A new product can never reach the kiosk without a purchase order being raised and received against it. Both sale screens draw the menu from `/inventory`, and nothing creates an Inventory row until the first goods receipt.
- **B.** There is no manual stock adjustment. Spoilage, breakage, stocktake corrections, and opening stock have no path; stock only rises via receipts and falls via sales.
- **C.** Deleting a product is unguarded and destructive: the Product and its Inventory row are dropped with no check for stock on hand or open orders, and every historical order and receipt line renders "Unlinked product" forever. Suppliers already follow the correct rule (deactivate, never delete); products do not.
- **D.** A purchase order raised by mistake can never be cancelled. The only exit is closing it as if a delivery arrived, which invents stock and files a receipt for a delivery that never came.
- **E.** The admin ordering screen is blind: no current stock beside each product, no unit-cost input (the endpoint accepts one; the screen never sends it).
- **F.** Low stock is a hardcoded `< 5` badge on one page. No per-product reorder level.
- **G.** The back office cannot see the delivery ledger. `GET /purchases/:id/receipts` exists and admits admins, but no admin screen calls it.
- **H.** Suppliers have admin-only write routes and no UI at all.
- **I.** Small repairs: `updateProduct` answers a missing id with `200 null` and validation failures with 500; product and inventory lists are unsorted; the Products table shows neither price nor stock.

A–D corrupt or trap data; E–I are gaps. All are in scope for this round.

## Shape of the work

One spec, implemented as independent tasks in dependency order (the same shape as the warehouse plan): schema and backend first, screens after, each task leaving the system consistent and shippable. Splitting into three specs (correctness / reorder loop / ergonomics) was considered and rejected — the pieces share models, and the split buys ceremony and nothing else.

## 1. A product is born with a shelf (A)

`addProduct` creates the product's `Inventory` row (stock 0) in the same request. If the product write succeeds and the inventory write fails, the product is deleted again and the request fails whole — a product without a shelf is exactly the bug this section removes. The archive path (§3) keeps the row.

A one-off script in `scripts/` backfills an `Inventory` row (stock 0) for every existing product that has none. Idempotent: safe to run twice.

Nothing else moves. The kiosk (`KioskBilling`) and admin Billing both filter `stock > 0` client-side already, so a zero-stock row is invisible to buyers; the admin Inventory page starts showing the product immediately, at 0, which is the truth. Opening stock for a shelf that already physically exists is entered through §2's adjustment, not through a fake purchase order.

## 2. Manual stock adjustments, on a ledger (B)

New model `StockAdjustment`:

```
productId    ObjectId → Product, required, indexed
delta        Number, required, whole, non-zero (positive or negative)
reason       String, required, trimmed, capped at 200
adjustedBy   ObjectId → Admin, required
stockAfter   Number, required — the stock the write left behind
timestamps
```

The mirror of `GoodsReceipt`: the Inventory number stays derivable, and every movement has a row saying who and why. `stockAfter` is recorded so the ledger reads coherently even beside sales, which do not write adjustment rows.

**`POST /api/inventory/:productId/adjust`** (admin-only):

- Body `{ delta, reason }`. `delta` must be a whole non-zero number (`isWholeNonNegative` on its absolute value); `reason` must be non-empty after trimming. Anything else is 400.
- The product must exist and the Inventory row must exist (§1 guarantees it for new products; the backfill for old ones). Missing → 404.
- A negative delta is conditional, the same shape as the billing decrement: `updateOne({ productId, stock: { $gte: -delta } }, { $inc: { stock: delta } })`. No match → 400 "only N in stock", where N is re-read for the message. A stale screen cannot push stock negative.
- A positive delta is a plain `$inc`.
- The `StockAdjustment` row is written after the stock write succeeds, with `stockAfter` taken from the updated row. If the ledger write fails, the stock write is compensated (reverse `$inc`) and the request fails — the invariant is "no movement without a row", both directions.

**`GET /api/inventory/:productId/adjustments`** (admin-only): the product's adjustments, newest first, `adjustedBy` populated as `email role`, capped at 100.

**UI (admin Inventory page):** each row gains an **Adjust** action opening a modal — delta (signed, whole), reason (required), current stock shown — and a **History** action listing that product's adjustments (date, delta, reason, who, stock after). No global adjustments feed this round; the per-product view is where the question "why is this number wrong" actually gets asked.

## 3. Products archive, never delete (C)

Same rule suppliers already follow, for the same reason: money remembers products. Orders, receipts, and transactions reference product rows forever, so nothing may unlink them.

**Model:** `active: Boolean, default: true` on Product. Rows predating the field have no `active`; absent means active, and every filter is written `active: { $ne: false }` (the roleless-admin pattern) so introducing the field changes nothing.

**Routes:**

- `DELETE /api/products/:id` is retired — removed from the router entirely, so it 404s.
- Archive and restore go through the existing `PUT /api/products/:id`, which learns to accept `active` alongside its current fields. `updateProduct` builds its update from the fields actually present in the body rather than writing `undefined` over the rest (this also serves §9's repair).

**Filtering:**

- `getProducts` returns active products by default; `?all=1` returns everything (the supplier list's convention), which the admin Products page uses so archived rows stay visible and restorable.
- `getInventory` populates the product either way (the admin Inventory page shows archived rows badged, stock and history intact) — so the two screens that *sell from* `/inventory` filter client-side: kiosk `KioskBilling` and admin `Billing` drop rows where `productId.active === false`. The two ordering screens (admin `Purchase`, warehouse `NewOrder`) build their lists from `GET /products` and are covered by its new default without touching the storeroom app.
- **Server-side backstop:** the bill path in `transactionController` refuses a line whose product is archived (400, named product), so a till open since morning cannot sell one. The pending-order approval path re-reads stock already; it gains the same product-active check at approval.

**UI (admin Products page):** the Delete button becomes **Archive** (confirm dialog says what archiving means: hidden from sale, history kept, restorable). Archived rows render badged "Archived" with a **Restore** action. Archiving with stock on hand is allowed — the stock stays visible on the Inventory page and can be adjusted out (§2) if it is really gone.

Open purchase orders may still name an archived product; receiving against them still works (the storeroom already has the goods either way). "Unlinked product" should now only ever appear on rows damaged before this fix.

## 4. Purchase orders can be cancelled (D)

**Model:** `status` gains `CANCELLED`; new fields `cancelledAt: Date`, `cancelledBy: ObjectId → Admin`.

**`PUT /api/purchases/:id/cancel`** (admin-only — the storeroom already has its honest exit, closing short at what actually arrived; cancellation is an office decision):

- Guarded transition, the same shape as completion: `findOneAndUpdate({ _id, status: { $in: ["NEW", "PARTIAL"] } }, { status: "CANCELLED", cancelledAt, cancelledBy })`. No match → 409 if the order exists (already completed or cancelled), 404 if not. No double-cancel, no cancelling a closed order, no race between two tabs.
- Cancelling a PARTIAL keeps everything already booked: receipts stand, stock stands, `items[].received` stands. Only the remainder is voided, and the shortfall stays readable as ordered-minus-received. Nothing is compensated because nothing is being undone — a cancel is a statement about the future of the order, not its past.

**List changes:** cancelled orders leave the open lists by construction (`getNewPurchases` / `getOpenPurchases` ask for NEW/PARTIAL). `getCompletedPurchases` becomes the closed ledger: `status: { $in: ["COMPLETED", "CANCELLED"] }`, still `.lean()` for the legacy-`received` reason documented on it.

**UI (admin Purchased page):** each pending card gains a **Cancel order** button (confirm dialog; on a PARTIAL it states what stays booked). The Completed tab is renamed **Closed** and shows COMPLETED and CANCELLED orders, cancelled ones badged, sorted by `completedAt ?? cancelledAt` descending. The storeroom app is untouched.

## 5. Order with your eyes open (E)

Admin `Purchase.jsx` catches up to the storeroom's `NewOrder` screen:

- Fetch `/inventory` alongside `/products`; show a **Current stock** column per line (0 for products with no row yet, low rows highlighted per §6).
- Add a **Unit cost (₹)** input per line, sent as `purchasePrice` on `createPurchase` — the endpoint already accepts and stores it; only this screen never sends it. Optional, non-negative; blank means "nobody said" and is sent as absent, not 0, per the receiving path's convention.
- Archived products never appear — `GET /products` now defaults to active-only (§3); this screen needs no filter of its own.

## 6. Reorder levels replace the magic 5 (F)

`reorderLevel: Number, default: 5` on Product — 5 is today's hardcoded badge threshold, so nothing changes until someone edits it. Rows predating the field read as 5 via the schema default on hydration (these reads are not `.lean()`).

Low stock is `stock < reorderLevel`, exactly the current comparison. Consumed by:

- the Inventory page badge (replacing the literal 5),
- §5's low-stock highlight on the ordering screen.

Editable in the Products add/edit form and the Inventory page's edit modal (whole, ≥ 0; 0 means "never flag"). Validated server-side in `addProduct`/`updateProduct`. No dashboard tile this round — the two screens that act on the number carry it.

## 7. The office can read the delivery ledger (G)

Each order card on the admin Purchased page — both tabs — gains **View deliveries**, expanding in place to the existing `GET /api/purchases/:id/receipts`: per receipt, the date, who received it (`email`), invoice number, note, and received/damaged per line with damage reasons. Fetched on first expand, not with the list.

The route is `protectWarehouse`, whose allow-list includes admins. Zero backend change.

## 8. A Suppliers screen (H)

New admin page `/suppliers`, sidebar entry beside Purchase, built entirely on the existing routes:

- List via `GET /api/suppliers?all=1` — active and inactive, inactive badged.
- Add (name required; phone, contact person, notes optional) via `POST`.
- Edit and deactivate/reactivate via `PUT /:id` — the active toggle is the only removal, matching the model's no-delete rule.

House furniture throughout: `PageHeader`, table, modal, toasts, same as Products.

## 9. Small repairs (I)

- `updateProduct`: 404 when the id matches nothing (currently `200 null`); validation failures answered 400, not 500; update built from fields present in the body (see §3).
- `getProducts` sorted by name server-side with `collation({ locale: "en", strength: 2 })` for case-insensitive order. `getInventory` cannot sort by a populated field in the query, so the controller sorts the populated result by product name before responding — same order, decided in one place, not in four clients.
- Products table gains **Price** and **Reorder level** columns, so managing an item stops requiring two screens.
- **Deferred, explicitly:** pagination and date-filtering of the Closed tab, and any dashboard low-stock tile. The fix plan's argument stands — a canteen catalogue is small — until it doesn't.

## Error handling

House pattern throughout: guarded transitions (`findOneAndUpdate` on expected status/stock) for anything two tabs could race on; compensation where a request makes two dependent writes (§1 product+inventory, §2 stock+ledger); honest 4xx messages naming what to do next; 404 for ids that match nothing, 409 for states already left.

## Testing

Backend tests per task, in the existing suite's style:

- §1: creating a product creates its inventory row; the backfill script is idempotent.
- §2: adjustment writes ledger row with correct `stockAfter`; negative delta below stock → 400 and no movement; zero/fractional delta and empty reason → 400; non-admin → 403.
- §3: archived products absent from default `getProducts`, present under `?all=1`; bill and pending-order approval refuse archived products; `DELETE /products/:id` 404s; legacy rows without `active` behave as active.
- §4: cancel from NEW and from PARTIAL (received stock and receipts untouched); cancel of COMPLETED/CANCELLED → 409; unknown id → 404; non-admin → 403; closed ledger lists both statuses.
- §6: reorder level validated; legacy rows read as 5.
- §9: `updateProduct` 404/400 behaviour.

Frontends stay gated by build, as now.

## Out of scope

Receipt/bill printing, refunds and voids, cost/margin reporting, websocket live updates, kiosk-side UI changes beyond the archived-product filter, the storeroom app (untouched), and everything already listed as deferred in `FIX-PLAN.md`.
