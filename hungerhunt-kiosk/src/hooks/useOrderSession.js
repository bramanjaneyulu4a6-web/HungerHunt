import { useEffect } from "react";

import { setOrderSessionActive } from "../utils/kioskSession";

/* Marks an order session for the lifetime of the component that calls it.
   KioskBilling calls it; see src/utils/kioskSession.js for why. */
export const useOrderSession = () => {
  useEffect(() => {
    setOrderSessionActive(true);
    return () => setOrderSessionActive(false);
  }, []);
};
