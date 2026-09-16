import { useEffect, useState } from 'react';

import api from './api';

/* The account behind the stored token, read from GET /admin/me.
 *
 * The console stores nothing about the person but the token itself, and until
 * the super admin existed it never needed to know who was signed in. It still
 * knows as little as it can: one request after sign-in, shared by every
 * screen that asks, forgotten on sign-out. A failed read answers as a plain
 * admin — the menus fall back to the hidden set, and every request behind
 * them is still judged by the server. */

// hiddenFeatures is empty until the server answers: a menu that appears late
// beats one that vanishes, and nothing behind a hidden entry is a permission.
const PLAIN_ADMIN = { id: '', name: '', email: '', role: 'admin', isSuperAdmin: false, hiddenFeatures: [] };

let cached = null;
let inflight = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(cached));

const load = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.get('/admin/me')
      .then((response) => ({
        ...PLAIN_ADMIN,
        ...response.data,
        isSuperAdmin: response.data?.isSuperAdmin === true,
        hiddenFeatures: Array.isArray(response.data?.hiddenFeatures) ? response.data.hiddenFeatures : [],
      }))
      .catch(() => PLAIN_ADMIN)
      .then((me) => {
        cached = me;
        inflight = null;
        notify();
        return me;
      });
  }
  return inflight;
};

// Called on sign-out, so the next sign-in asks again rather than inheriting
// the last person's answer.
export const clearCurrentStaff = () => {
  cached = null;
  inflight = null;
};

// Something on the roster changed the signed-in account itself — re-ask.
export const refreshCurrentStaff = () => {
  cached = null;
  return load();
};

export const useCurrentStaff = () => {
  const [me, setMe] = useState(cached);

  useEffect(() => {
    listeners.add(setMe);
    load();
    return () => { listeners.delete(setMe); };
  }, []);

  return { me: me ?? PLAIN_ADMIN, loaded: me !== null };
};
