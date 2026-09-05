# Rollout — hostel → room

The rename is **not additive**. The API, the database and every client change
names at the same moment: `hostels` → `rooms`, `hostelId` → `roomId`,
`hostelNumber` → `roomNumber`, a caretaker's single `hostelId` → a `roomIds`
array. A client on the old names talks to nothing on the new backend, and the
new backend reads nothing in an unmigrated database.

**So this is all-or-nothing.** There is a window — from the moment the backend
restarts until the last client is rebuilt — in which old clients are broken. Do
it in one sitting, out of hours.

Two safety nets are already in place and you should not need them:

- `backend/scripts/migrateHostelsToRooms.js` refuses to run when both `hostels`
  and a non-empty `rooms` exist, and refuses to report success if `hostels`
  reappears mid-run.
- The backend **refuses to boot** against a database that still has a `hostels`
  collection. Deploying before migrating now fails fast instead of silently
  serving empty rooms.

---

## The order

1. **Stop the backend.**
2. **Run the migration** against the target database.
3. **Verify the printed counts.**
4. **Deploy the backend.**
5. **Redeploy the four Vercel apps.**
6. **Rebuild and re-sideload the kiosk and warehouse APKs.**
7. **Rebuild the parent native apps.**

Nothing may overlap. A backend running during step 2 recreates `rooms` from its
indexes underneath the migration.

---

## 1. Stop the backend

Render dashboard → the backend service → suspend it (or scale to zero). Confirm
it is actually down before continuing:

```
curl -sS -o /dev/null -w '%{http_code}\n' https://<backend-host>/health
```

**Success looks like:** a connection failure or a 502/503. A `200` means the
service is still up — do not continue.

## 2. Run the migration

From `backend/`, with `MONGO_URI` pointing at the database you intend to change:

```
node scripts/migrateHostelsToRooms.js
```

The script reads `MONGO_URI` from the environment via `dotenv`. **Check which
database you are about to hit before you press enter** — `backend/.env` points at
local dev (`hungerhunt_dev`) and that is deliberate. For production, set
`MONGO_URI` explicitly for this one command; do not edit `.env`.

The script is idempotent — re-running it after a successful run is safe and
prints `no "hostels" collection: the rename is already done`.

**Success looks like:**

```
renamed "hostels" to "rooms"
rooms: <n>
students missing roomId: 0
caretakers missing roomIds: 0
orders missing snapshot roomId: 0
```

**When it refuses to run**, you get one of these and no changes are committed
beyond that point:

- *"Both "hostels" (N documents) and "rooms" (M documents) hold data. This script
  will not guess which is authoritative. Stop the backend, reconcile the two
  collections by hand, and run this again."* — two real datasets exist. Stop and
  reconcile by hand; do not re-run hoping for a different answer.
- *"A "hostels" collection still exists after the migration. The backend is
  probably still running and recreating it. Stop it, verify the data in "rooms",
  and run this again."* — you did not finish step 1. Stop the backend properly,
  confirm `rooms` holds the data, drop the stray `hostels`, re-run.

It also prints `dropping the empty "rooms" collection a running backend created`
when it clears the index-only collection a premature boot left behind. That line
is normal recovery, not an error.

## 3. Verify the counts

`rooms` must equal the room count you had before. The three `missing` lines must
all be `0`. A non-zero `caretakers missing roomIds` means a caretaker account had
no hostel to inherit — fix it in the admin console after step 4; it does not
block the deploy. A non-zero `students missing roomId` **does** block: stop and
investigate before starting the backend.

## 4. Deploy the backend

Resume / redeploy the Render service on the new commit.

**Success looks like:** `MongoDB Connected Successfully` then
`Server running on port …` in the logs, and `/health` returning 200.

**Failure looks like** the guard firing:

```
FATAL: this database still has a "hostels" collection, so the hostel→room
migration has not run. Refusing to start: ...
```

and the process exiting non-zero. That means step 2 did not happen against
*this* database. Go back to step 2, then restart the service.

## 5. Redeploy the four Vercel apps

`frontend-admin`, `frontend-parent`, `hungerhunt-kiosk`, `hungerhunt-warehouse`.
The API URL is baked in at build time, so each one needs an actual rebuild — a
cached deploy is not enough.

**Success looks like:** the admin console listing rooms, a caretaker's order list
showing room numbers, and no `hostel` anywhere in the UI.

## 6. Kiosk and warehouse APKs

These are sideloaded and **nothing updates itself**. Follow
[android-apk-builds.md](android-apk-builds.md):

```
cd hungerhunt-kiosk    && npm run build:release && npx cap sync android
cd hungerhunt-warehouse && npm run build:release && npx cap sync android
```

`build:release` is mandatory — it validates the release env and stamps the build
version. Then assemble the signed release APK, copy it to each device, and
install over the old one.

**Field devices do not need a forced re-login.** The warehouse app reads its
stored profile as `profile.rooms ?? (profile.hostel ? [profile.hostel] : [])`
(`hungerhunt-warehouse/src/App.jsx`), so an old-shaped `localStorage` profile
still resolves. The next login writes the new shape.

## 7. Parent native apps

Rebuild and ship the Android and iOS parent builds per
[RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md). These reach users through the
stores on their own timetable — which is the longest tail in this rollout, and
the reason to do steps 1–6 in one sitting rather than spreading them out.

---

## Recovery — the backend was deployed first

Symptom: the service will not stay up, and the logs carry the `FATAL:` line
above. Nothing is corrupted; the backend refused to serve.

1. Stop / suspend the service again.
2. Run `node scripts/migrateHostelsToRooms.js`. If a booting backend created an
   empty `rooms`, the script drops it and says so. If it says both collections
   hold data, stop and reconcile by hand.
3. Verify the counts (step 3).
4. Restart the service.

## Afterwards

Once every environment — production, staging, any local database anyone still
uses — has migrated, delete the guard: `backend/utils/hostelRenameGuard.js`, its
call in `backend/server.js`, and `backend/tests/hostelRenameGuard.test.js`. The
migration script can go at the same time.
