import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';

const Hostels = () => {
  const [hostels, setHostels] = useState([]);
  const [form, setForm] = useState({ code: '', name: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setHostels((await api.get('/hostels')).data);
    } catch (loadError) {
      console.error(loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { (async () => { await load(); })(); }, []);

  const addHostel = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/hostels', form);
      setForm({ code: '', name: '' });
      toast.success('Hostel added');
      await load();
    } catch (saveError) {
      toast.error(saveError.response?.data?.message || 'Could not add hostel');
    } finally {
      setSaving(false);
    }
  };

  const rename = async (hostel) => {
    const code = window.prompt('Hostel code', hostel.code)?.trim();
    if (!code) return;
    const name = window.prompt('Hostel name (optional)', hostel.name || '');
    if (name === null) return;
    try {
      await api.put(`/hostels/${hostel._id}`, { code, name });
      toast.success('Hostel updated');
      await load();
    } catch (saveError) {
      toast.error(saveError.response?.data?.message || 'Could not update hostel');
    }
  };

  const setActive = async (hostel, active) => {
    if (!active && !window.confirm(`Deactivate ${hostel.code}? It will no longer be offered for new assignments.`)) return;
    try {
      await api.put(`/hostels/${hostel._id}`, { active });
      toast.success(active ? 'Hostel reactivated' : 'Hostel deactivated');
      await load();
    } catch (saveError) {
      toast.error(saveError.response?.data?.message || 'Could not update hostel');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Hostels" subtitle="Manage the dorms used for student and caretaker assignments." />

      <Card className="card--tight" style={{ marginBottom: 24 }}>
        <form onSubmit={addHostel} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label className="field-label" htmlFor="hostel-code">Hostel code</label>
            <input id="hostel-code" className="input" required value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="D-4" />
          </div>
          <div style={{ flex: '2 1 260px' }}>
            <label className="field-label" htmlFor="hostel-name">Name (optional)</label>
            <input id="hostel-name" className="input" value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="East Dormitory" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add hostel'}</Button>
        </form>
      </Card>

      {error ? <Banner variant="alert" icon="⚠️">Could not load hostels.</Banner> : loading ? (
        <Skeleton height={180} radius={14} />
      ) : hostels.length === 0 ? (
        <EmptyState icon="⌂" title="No hostels yet">Add the first hostel before registering students or caretakers.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead><tr><th>Code</th><th>Name</th><th>Students</th><th>Caretakers</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{hostels.map((hostel) => (
              <tr key={hostel._id}>
                <td data-label="Code"><strong>{hostel.code}</strong></td>
                <td data-label="Name">{hostel.name || '—'}</td>
                <td data-label="Students">{hostel.studentCount}</td>
                <td data-label="Caretakers">{hostel.caretakerCount}</td>
                <td data-label="Status">{hostel.active ? 'Active' : 'Inactive'}</td>
                <td data-label="Actions"><div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="link-button" onClick={() => rename(hostel)}>Rename</button>
                  <button type="button" className="link-button" onClick={() => setActive(hostel, !hostel.active)}>
                    {hostel.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Hostels;
