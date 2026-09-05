import { useState } from 'react';
import toast from 'react-hot-toast';

import api from '../../utils/api';
import { Badge, Button, EmptyState, Skeleton } from '../../components/ui';

const EMPTY = { name: '', phone: '', email: '', password: '', role: 'admin', roomIds: [] };

export default function StaffTab({ staff, rooms, loading, onChanged }) {
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState(null);

  const openCreate = () => { setEditing(null); setForm(EMPTY); };
  const openEdit = (account) => {
    setEditing(account);
    setForm({
      name: account.name || '', phone: account.phone || '', email: account.email || '', password: '',
      role: account.role || 'admin', roomIds: (account.rooms || []).map((room) => room.id),
    });
  };
  const close = () => { setEditing(undefined); setForm(EMPTY); };

  const submit = async (event) => {
    event.preventDefault();
    if (form.role === 'caretaker' && !form.roomIds.length) {
      toast.error('Choose at least one room');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/admin/users/staff/${editing.id}`, {
          ...form,
          roomIds: form.role === 'caretaker' ? form.roomIds : [],
        });
      } else {
        await api.post('/admin/register', {
          ...form,
          roomIds: form.role === 'caretaker' ? form.roomIds : [],
        });
      }
      toast.success(editing ? 'Staff account updated' : 'Staff account created');
      close();
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save staff account');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (account, active) => {
    if (!active && !window.confirm(`Archive ${account.name}? Their current session will stop working immediately.`)) return;
    setWorkingId(account.id);
    try {
      if (active) await api.put(`/admin/users/staff/${account.id}`, { active: true, role: account.role, roomIds: (account.rooms || []).map((room) => room.id) });
      else await api.delete(`/admin/users/staff/${account.id}`);
      toast.success(active ? 'Staff account restored' : 'Staff account archived');
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update staff account');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) return <Skeleton height={220} radius={14} />;

  return (
    <section>
      <div className="users-tab-head"><div><h2>Staff accounts</h2><p>Admins, warehouse staff, and room caretakers.</p></div><Button onClick={openCreate}>Add staff account</Button></div>
      {!staff.length ? (
        <EmptyState icon="♙" title="No staff accounts" action={<Button onClick={openCreate}>Add staff</Button>} />
      ) : (
        <div className="table-wrap"><table className="table table--stack table--hover">
          <thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Assignment</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{staff.map((account) => (
            <tr key={account.id}>
              <td data-label="Name"><strong>{account.name}</strong></td>
              <td data-label="Contact"><div>{account.phone}</div><small>{account.email || 'No email'}</small></td>
              <td data-label="Role">{account.role === 'admin' ? 'Admin' : account.role === 'warehouse' ? 'Warehouse' : 'Caretaker'}</td>
              <td data-label="Assignment">{(account.rooms || []).map((room) => room.code).join(' · ') || '—'}</td>
              <td data-label="Status"><Badge variant={account.active ? 'success' : 'neutral'}>{account.active ? 'Active' : 'Inactive'}</Badge></td>
              <td data-label="Actions"><div className="cell-actions">
                <Button className="btn--sm" variant="ghost" onClick={() => openEdit(account)}>Edit</Button>
                <Button className="btn--sm" variant="danger" disabled={workingId === account.id} onClick={() => setActive(account, false)}>Archive</Button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {editing !== undefined && (
        <div className="modal-backdrop" onClick={() => !saving && close()}>
          <form className="modal" style={{ maxWidth: 560 }} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><div><h3 className="modal-title">{editing ? 'Edit staff account' : 'Add staff account'}</h3><p className="modal-sub">Access is enforced by the selected role.</p></div></header>
            <div className="modal-fields">
              <label><span className="field-label">Full name</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label><span className="field-label">Phone</span><input className="input" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} /></label>
              <label><span className="field-label">Email{form.role === 'admin' ? '' : ' (optional)'}</span><input className="input" type="email" required={form.role === 'admin'} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              {!editing && <label><span className="field-label">Temporary password</span><input className="input" type="password" minLength={8} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
              <label><span className="field-label">Role</span><select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, roomIds: event.target.value === 'caretaker' ? form.roomIds : [] })}>
                <option value="admin">Admin — full back office</option><option value="warehouse">Warehouse</option><option value="caretaker">Caretaker</option>
              </select></label>
              {form.role === 'caretaker' && <fieldset className="student-picker"><legend>Assigned rooms</legend>
                {rooms.filter((room) => room.active).map((room) => (
                  <label key={room._id} className="student-picker__row">
                    <input
                      type="checkbox"
                      checked={form.roomIds.includes(room._id)}
                      onChange={() => setForm({
                        ...form,
                        roomIds: form.roomIds.includes(room._id)
                          ? form.roomIds.filter((id) => id !== room._id)
                          : [...form.roomIds, room._id],
                      })}
                    />
                    <span><strong>{room.code}</strong>{room.name && <small>{room.name}</small>}</span>
                  </label>
                ))}
              </fieldset>}
            </div>
            <div className="modal-actions"><Button variant="ghost" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving || (form.role === 'caretaker' && !form.roomIds.length)}>{saving ? 'Saving…' : 'Save staff account'}</Button></div>
          </form>
        </div>
      )}
    </section>
  );
}
