import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

import api from '../../utils/api';
import { Badge, Banner, Button, EmptyState, Skeleton } from '../../components/ui';

const PAGE_SIZE = 50;

const matches = (values, search) => {
  const query = search.trim().toLowerCase();
  return !query || values.some((value) => String(value || '').toLowerCase().includes(query));
};

export default function ArchivedUsersTab({ parents, staff, loadingAccounts, onChanged }) {
  const [searchParams] = useSearchParams();
  const focusedParentId = searchParams.get('focus') || '';
  const [workingId, setWorkingId] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [studentTotal, setStudentTotal] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadStudents = useCallback(async (requestedPage = 1) => {
    setLoadingStudents(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/students', { params: {
        page: requestedPage,
        limit: PAGE_SIZE,
        status: 'archived',
        q: search.trim() || undefined,
      } });
      setStudents(data.students || []);
      setPage(data.page || requestedPage);
      setPages(data.pages || 1);
      setStudentTotal(data.total || 0);
    } catch (error) {
      setLoadError(true);
      toast.error(error.response?.data?.message || 'Could not load archived users');
    } finally {
      setLoadingStudents(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadStudents(1), 250);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  useEffect(() => {
    if (loadingAccounts || !focusedParentId) return;
    document.getElementById(`archived-parent-${focusedParentId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [focusedParentId, loadingAccounts, parents]);

  const archivedParents = useMemo(() => parents.filter((parent) => !parent.active && matches([
    parent.fatherName,
    parent.phone,
    parent.email,
    ...(parent.students || []).flatMap((student) => [student.name, student.admissionNumber, student.roomNumber]),
  ], search)), [parents, search]);

  const archivedStaff = useMemo(() => staff.filter((account) => !account.active && matches([
    account.name,
    account.phone,
    account.email,
    account.role,
    ...(account.rooms || []).flatMap((room) => [room.code, room.name]),
  ], search)), [search, staff]);

  const showStudents = type === 'all' || type === 'student';
  const showParents = type === 'all' || type === 'parent';
  const showStaff = type === 'all' || type === 'staff';
  const visibleCount = (showStudents ? studentTotal : 0)
    + (showParents ? archivedParents.length : 0)
    + (showStaff ? archivedStaff.length : 0);
  const loading = loadingAccounts || loadingStudents;

  const restoreStudent = async (student) => {
    setWorkingId(student._id);
    try {
      await api.post(`/students/${student._id}/restore`);
      toast.success(`${student.name} restored`);
      await loadStudents(students.length === 1 && page > 1 ? page - 1 : page);
      await onChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not restore this student');
    } finally {
      setWorkingId(null);
    }
  };

  const restoreParent = async (parent) => {
    if (!window.confirm(`Restore ${parent.fatherName}'s account? They will verify their phone by SMS and create a password.`)) return;
    setWorkingId(parent.id);
    try {
      await api.post(`/admin/users/parents/${parent.id}/require-password-setup`);
      toast.success('Parent account restored');
      await onChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not restore this parent account');
    } finally {
      setWorkingId(null);
    }
  };

  const restoreStaff = async (account) => {
    setWorkingId(account.id);
    try {
      await api.put(`/admin/users/staff/${account.id}`, {
        active: true,
        role: account.role,
        roomIds: account.role === 'caretaker' ? (account.rooms || []).map((room) => room.id) : [],
      });
      toast.success(`${account.name} restored`);
      await onChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not restore this staff account');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading && !students.length && !parents.length && !staff.length) {
    return <Skeleton height={220} radius={14} />;
  }

  return (
    <section>
      <div className="users-tab-head">
        <div><h2>Archived users</h2><p>Find and restore students, parents, and staff accounts.</p></div>
      </div>

      <div className="toolbar">
        <input
          className="input toolbar-input"
          type="search"
          aria-label="Search archived users"
          placeholder="Search archived users…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="input toolbar-select" aria-label="Filter archived users by type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">All user types</option>
          <option value="student">Students</option>
          <option value="parent">Parents</option>
          <option value="staff">Staff</option>
        </select>
        <p className="toolbar-count">{loading ? 'Loading…' : `${visibleCount} archived user${visibleCount === 1 ? '' : 's'}`}</p>
      </div>

      {loadError && showStudents && <Banner variant="alert">Archived students could not be loaded. Parent and staff results are still shown.</Banner>}

      {!loading && !visibleCount ? (
        <EmptyState icon="✓" title="No archived users">Archived accounts will appear here and can be restored.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead><tr><th>User</th><th>Type</th><th>Details</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {showStudents && students.map((student) => (
                <tr key={`student-${student._id}`}>
                  <td data-label="User"><strong>{student.name}</strong><small>{student.admissionNumber || 'No admission number'}</small></td>
                  <td data-label="Type">Student</td>
                  <td data-label="Details">Grade {student.grade || '—'} · Room {student.roomNumber || '—'}</td>
                  <td data-label="Status"><Badge variant="neutral">Archived</Badge></td>
                  <td data-label="Action"><Button className="btn--sm" disabled={workingId === student._id} onClick={() => restoreStudent(student)}>{workingId === student._id ? 'Restoring…' : 'Restore'}</Button></td>
                </tr>
              ))}
              {showParents && archivedParents.map((parent) => (
                <tr
                  id={`archived-parent-${parent.id}`}
                  key={`parent-${parent.id}`}
                  className={String(parent.id) === focusedParentId ? 'user-row--focused' : undefined}
                >
                  <td data-label="User"><strong>{parent.fatherName}</strong><small>{parent.email}</small></td>
                  <td data-label="Type">Parent</td>
                  <td data-label="Details">{parent.phone} · {(parent.students || []).map((student) => student.name).join(', ') || 'No linked students'}</td>
                  <td data-label="Status"><Badge variant="neutral">Archived</Badge></td>
                  <td data-label="Action"><Button className="btn--sm" disabled={workingId === parent.id} onClick={() => restoreParent(parent)}>{workingId === parent.id ? 'Restoring…' : 'Restore'}</Button></td>
                </tr>
              ))}
              {showStaff && archivedStaff.map((account) => (
                <tr key={`staff-${account.id}`}>
                  <td data-label="User"><strong>{account.name}</strong><small>{account.email}</small></td>
                  <td data-label="Type">Staff</td>
                  <td data-label="Details">{account.role === 'admin' ? 'Admin' : account.role === 'warehouse' ? 'Warehouse' : 'Caretaker'}{(account.rooms || []).length ? ` · ${(account.rooms || []).map((room) => room.code).join(' · ')}` : ''}</td>
                  <td data-label="Status"><Badge variant="neutral">Archived</Badge></td>
                  <td data-label="Action"><Button className="btn--sm" disabled={workingId === account.id} onClick={() => restoreStaff(account)}>{workingId === account.id ? 'Restoring…' : 'Restore'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showStudents && pages > 1 && (
        <nav className="table-pagination" aria-label="Archived student pages">
          <Button variant="ghost" className="btn--sm" disabled={page <= 1 || loadingStudents} onClick={() => loadStudents(page - 1)}>Previous</Button>
          <span>Student page {page} of {pages}</span>
          <Button variant="ghost" className="btn--sm" disabled={page >= pages || loadingStudents} onClick={() => loadStudents(page + 1)}>Next</Button>
        </nav>
      )}

    </section>
  );
}
