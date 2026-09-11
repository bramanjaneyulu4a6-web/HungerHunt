import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthContext } from './auth';
import API from '../services/api';
import { stopPush } from '../utils/push';

/* Read once, at module scope, rather than in an effect after the first render.
   The session is already in localStorage when the app starts — there is nothing
   to synchronise and nothing to wait for, so there is no loading state and no
   render showing a signed-in parent as signed out. */
const restoreSession = () => {
  if (!localStorage.getItem('parentToken')) return null;

  try {
    const saved = localStorage.getItem('parentData');
    if (!saved) {
      localStorage.removeItem('parentToken');
      return null;
    }
    return JSON.parse(saved);
  } catch {
    // Corrupt entry: drop it rather than leaving it to fail again next start.
    localStorage.removeItem('parentData');
    localStorage.removeItem('parentToken');
    return null;
  }
};

const NO_SESSION = { status: 'signed-out', pending: [] };
const ASKING = { status: 'asking', pending: [] };

export const AuthProvider = ({ children }) => {
  const [parent, setParent] = useState(restoreSession);

  /* Which children still have no purchase code. The app is gated on this — see
     ProtectedRoute in App.jsx — so it is asked here, once per signed-in
     session, rather than by each screen that might care.

     Only the answer is held, stamped with who it is about and which asking it
     belongs to. Everything else is derived below: signed out when there is no
     parent, and 'asking' whenever the answer on hand is not the one currently
     being waited for. Storing those two states instead would mean setting
     state from inside the effect, which cascades a render every time the
     session changes. */
  const [answer, setAnswer] = useState(null);
  const [asked, setAsked] = useState(0);

  const refreshCodeSetup = useCallback(() => setAsked((n) => n + 1), []);

  useEffect(() => {
    if (!parent) return undefined;

    // An answer for a session that has since ended must not land.
    let ignore = false;

    API.get('/parent/purchase-code-setup')
      .then((response) => {
        if (ignore) return;
        setAnswer({
          parentId: parent.id,
          asked,
          status: 'known',
          pending: response.data?.pending ?? [],
        });
      })
      .catch(() => {
        if (ignore) return;

        /* Nothing is held back when the question cannot be asked. A parent on
           a bad connection would otherwise be shut out of the whole app by a
           screen that cannot load the children it is about — and the gate is
           not what stops a code-less child spending: the counter refuses them
           outright. The question is asked again on every start, so this opens
           the app for one session rather than for good. */
        setAnswer({ parentId: parent.id, asked, status: 'unknown', pending: [] });
      });

    return () => {
      ignore = true;
    };
  }, [parent, asked]);

  const codeSetup = useMemo(() => {
    if (!parent) return NO_SESSION;
    if (answer?.parentId !== parent.id) return ASKING;

    /* Being asked again keeps the answer on hand rather than emptying it. The
       setup screen refreshes this the moment it saves the last code, and an
       empty list in the meantime would blank the screen out from under the
       parent for as long as the request takes. */
    if (answer.asked !== asked) return { status: 'asking', pending: answer.pending };

    return { status: answer.status, pending: answer.pending };
  }, [parent, answer, asked]);

  const login = (token, parentData) => {
    localStorage.setItem('parentToken', token);
    localStorage.setItem('parentData', JSON.stringify(parentData));
    setParent(parentData);
  };

  /* `sessionAlreadyEnded` is for the one caller whose token is already dead
     server-side: account deletion. Withdrawing the device is normally done
     first, while the session still works, because that request carries the
     token being thrown away. After deletion it cannot work, and letting it run
     with the token still stored makes the 401 interceptor redirect to
     "your session has expired" — the wrong sentence for someone who just
     deleted their account. Clearing first silences it; stopPush still runs,
     because it also resets the module state that lets a later sign-in on this
     device register again. */
  const logout = async ({ sessionAlreadyEnded = false } = {}) => {
    if (sessionAlreadyEnded) {
      localStorage.removeItem('parentToken');
      localStorage.removeItem('parentData');
    }

    // Withdrawing the device has to happen while the session is still valid —
    // the request carries the token being thrown away. Without it, this device
    // keeps receiving this family's notifications after sign-out.
    await stopPush();

    localStorage.removeItem('parentToken');
    localStorage.removeItem('parentData');
    setParent(null);
  };

  return (
    <AuthContext.Provider value={{ parent, login, logout, codeSetup, refreshCodeSetup }}>
      {children}
    </AuthContext.Provider>
  );
};
