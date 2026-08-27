import { useCallback, useEffect, useMemo, useState } from 'react';

import api from '../utils/api';
import { Banner, PageHeader } from '../components/ui';
import Students from './Students';
import ParentsTab from './users/ParentsTab';
import StaffTab from './users/StaffTab';
import ArchivedStudentsTab from './users/ArchivedStudentsTab';

const TABS = [
  ['students', 'Students'],
  ['parents', 'Parents'],
  ['staff', 'Staff'],
  ['archived', 'Archived students'],
];

export default function Users() {
  const [tab, setTab] = useState('students');
  const [parents, setParents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [parentRes, staffRes, hostelRes] = await Promise.all([
        api.get('/admin/users/parents'),
        api.get('/admin/users/staff'),
        api.get('/hostels'),
      ]);
      setParents(parentRes.data || []);
      setStaff(staffRes.data || []);
      setHostels(hostelRes.data || []);
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

  return (
    <div className="page users-page">
      <PageHeader
        title="Users"
        subtitle="Manage students, their parent access, and every staff account from one place."
      />

      <div className="tabs users-tabs" role="tablist" aria-label="User types">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`tab${tab === id ? ' tab--active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && <Banner variant="alert">Some user records could not be loaded. Try refreshing.</Banner>}
      {tab === 'students' && <Students embedded parentByStudent={parentByStudent} onUsersChanged={load} />}
      {tab === 'parents' && (
        <ParentsTab parents={parents} loading={loading} onChanged={load} />
      )}
      {tab === 'staff' && (
        <StaffTab staff={staff} hostels={hostels} loading={loading} onChanged={load} />
      )}
      {tab === 'archived' && (
        <ArchivedStudentsTab onChanged={load} />
      )}
    </div>
  );
}
