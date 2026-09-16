import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import api from '../utils/api';
import { useCurrentStaff } from '../utils/currentStaff';
import { Banner, PageHeader } from '../components/ui';
import Students from './Students';
import ParentsTab from './users/ParentsTab';
import StaffTab from './users/StaffTab';
import ArchivedUsersTab from './users/ArchivedUsersTab';

const SECTIONS = new Set(['students', 'parents', 'staff', 'archived']);

/* The roster answers only to the super admin. For anyone else it is 403 —
   a refusal, not a failure — so it reads as an empty list rather than taking
   the students and parents down with it. */
const staffOrNone = () => api.get('/admin/users/staff')
  .then((response) => response.data || [])
  .catch((error) => {
    if (error.response?.status === 403) return [];
    throw error;
  });

export default function Users() {
  const { section } = useParams();
  const { me, loaded } = useCurrentStaff();
  const [parents, setParents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [parentRes, staffRows, roomRes] = await Promise.all([
        api.get('/admin/users/parents'),
        staffOrNone(),
        api.get('/rooms'),
      ]);
      setParents(parentRes.data || []);
      setStaff(staffRows);
      setRooms(roomRes.data || []);
    } catch (loadError) {
      console.error(loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(load, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const parentByStudent = useMemo(() => {
    const map = new Map();
    for (const parent of parents) {
      for (const student of parent.students || []) {
        const key = String(student.id);
        if (!map.has(key) || parent.active) map.set(key, parent);
      }
    }
    return map;
  }, [parents]);

  if (!SECTIONS.has(section)) return <Navigate to="/users/students" replace />;

  const activeParents = parents.filter((parent) => parent.active);
  const activeStaff = staff.filter((account) => account.active);

  return (
    <div className="page users-page">
      <PageHeader
        title="Users"
        subtitle="Manage students, their parent access, and every staff account from one place."
      />

      {error && <Banner variant="alert">Some user records could not be loaded. Check the connection and try again.</Banner>}
      {section === 'students' && <Students embedded parentByStudent={parentByStudent} onUsersChanged={load} />}
      {section === 'parents' && (
        <ParentsTab parents={activeParents} loading={loading} onChanged={load} />
      )}
      {section === 'staff' && loaded && !me.isSuperAdmin && (
        <Banner variant="warn">Only a super admin can see and manage staff accounts.</Banner>
      )}
      {section === 'staff' && loaded && me.isSuperAdmin && (
        <StaffTab staff={activeStaff} rooms={rooms} loading={loading} onChanged={load} me={me} />
      )}
      {section === 'archived' && (
        <ArchivedUsersTab parents={parents} staff={staff} loadingAccounts={loading} onChanged={load} />
      )}
    </div>
  );
}
