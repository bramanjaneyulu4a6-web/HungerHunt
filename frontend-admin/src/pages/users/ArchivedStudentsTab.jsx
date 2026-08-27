import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../../utils/api';
import { Badge, Button, EmptyState, Skeleton } from '../../components/ui';

const PAGE_SIZE = 50;

export default function ArchivedStudentsTab({ onChanged }) {
  const [workingId, setWorkingId] = useState(null);
  const [archived, setArchived] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/students', { params: {
        page: requestedPage, limit: PAGE_SIZE, status: 'archived', q: search.trim() || undefined,
      } });
      setArchived(data.students || []);
      setPage(data.page || requestedPage);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (error) {
      setLoadError(true);
      toast.error(error.response?.data?.message || 'Could not load archived students');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const restore = async (student) => {
    setWorkingId(student._id);
    try {
      await api.post(`/students/${student._id}/restore`);
      toast.success(`${student.name} restored`);
      const nextPage = archived.length === 1 && page > 1 ? page - 1 : page;
      await load(nextPage);
      await onChanged?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not restore this student');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) return <Skeleton height={180} radius={14} />;

  return (
    <section>
      <div className="users-tab-head"><div><h2>Archived students</h2><p>Restore a retired student to the active directory and kiosk.</p></div></div>
      <div className="toolbar">
        <input className="input toolbar-input" type="search" aria-label="Search archived students" placeholder="Search name, admission number, parent or hostel…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <p className="toolbar-count">{loading ? 'Loading…' : `${total} archived student${total === 1 ? '' : 's'}`}</p>
      </div>
      {loadError ? (
        <div><Button variant="ghost" onClick={() => load(page)}>Try again</Button></div>
      ) : !archived.length ? (
        <EmptyState icon="✓" title="No archived students">Archived student records will appear here and can be restored.</EmptyState>
      ) : <div className="table-wrap">
      <table className="table table--stack table--hover">
        <thead><tr><th>Admission No.</th><th>Name</th><th>Grade</th><th>Hostel</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{archived.map((student) => (
          <tr key={student._id}>
            <td data-label="Admission No.">{student.admissionNumber || '—'}</td>
            <td data-label="Name"><strong>{student.name}</strong></td>
            <td data-label="Grade">{student.grade || '—'}</td>
            <td data-label="Hostel">{student.hostelNumber || '—'}</td>
            <td data-label="Status"><Badge variant="neutral">Archived</Badge></td>
            <td data-label="Action">
              <Button className="btn--sm" disabled={workingId === student._id} onClick={() => restore(student)}>
                {workingId === student._id ? 'Restoring…' : 'Restore student'}
              </Button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      </div>}
      {pages > 1 && (
        <nav className="table-pagination" aria-label="Archived student pages">
          <Button variant="ghost" className="btn--sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="ghost" className="btn--sm" disabled={page >= pages || loading} onClick={() => load(page + 1)}>Next</Button>
        </nav>
      )}
    </section>
  );
}
