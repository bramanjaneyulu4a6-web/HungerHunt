import { useEffect, useState } from "react";

import api from "./api";

/* The account behind the stored token, read from GET /admin/me.
 *
 * The login already writes name, phone and rooms to localStorage for the
 * header; this adds the one thing that can change while the device is signed
 * in — which features a super admin has hidden from this role or this
 * account. Asked once per sign-in, shared by every screen, forgotten on
 * sign-out. A failed read hides nothing: a tab that appears late beats one
 * that vanishes, and nothing behind a hidden control is a permission. */

const NOBODY = { id: "", name: "", role: null, hiddenFeatures: [] };

let cached = null;
let inflight = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(cached));

const load = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.get("/admin/me")
      .then((response) => ({
        ...NOBODY,
        ...response.data,
        hiddenFeatures: Array.isArray(response.data?.hiddenFeatures) ? response.data.hiddenFeatures : [],
      }))
      .catch(() => NOBODY)
      .then((me) => {
        cached = me;
        inflight = null;
        notify();
        return me;
      });
  }
  return inflight;
};

export const clearCurrentStaff = () => {
  cached = null;
  inflight = null;
};

export const useCurrentStaff = () => {
  const [me, setMe] = useState(cached);

  useEffect(() => {
    listeners.add(setMe);
    load();
    return () => { listeners.delete(setMe); };
  }, []);

  return { me: me ?? NOBODY, loaded: me !== null };
};

// The question every screen asks, in one place.
export const useFeature = (key) => {
  const { me } = useCurrentStaff();
  return !me.hiddenFeatures.includes(key);
};
