/* Who an export can be narrowed to, read once per screen that asks — the
 * list behind components/ProcessedByPicker.jsx. Kept out of the component file
 * so that file exports only components.
 */
import { useEffect, useState } from 'react';

import api from './api';
import { NO_STAFF } from './transactionsExport';

export const useExportStaff = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    api
      .get('/v1/accounting-exports/staff')
      .then((response) => {
        if (!ignore) setStaff(response.data?.data || []);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Every key the picker can hold, so a caller can tell "all" from "some".
  const keys = [...staff.map((person) => person.id), NO_STAFF];
  return { staff, keys, loading, failed };
};

// The keys still ticked; empty means nobody, which a caller should refuse.
export const tickedKeys = (keys, unticked) => keys.filter((key) => !unticked.includes(key));
