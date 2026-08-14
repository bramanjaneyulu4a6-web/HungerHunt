import { useState } from 'react';

import { AuthContext } from './auth';
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

export const AuthProvider = ({ children }) => {
  const [parent, setParent] = useState(restoreSession);

  const login = (token, parentData) => {
    localStorage.setItem('parentToken', token);
    localStorage.setItem('parentData', JSON.stringify(parentData));
    setParent(parentData);
  };

  const logout = async () => {
    // Withdrawing the device has to happen while the session is still valid —
    // the request carries the token being thrown away. Without it, this device
    // keeps receiving this family's notifications after sign-out.
    await stopPush();

    localStorage.removeItem('parentToken');
    localStorage.removeItem('parentData');
    setParent(null);
  };

  return (
    <AuthContext.Provider value={{ parent, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
