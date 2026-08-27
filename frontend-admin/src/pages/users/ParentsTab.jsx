import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../../utils/api';
import { Badge, Banner, Button, EmptyState, Skeleton } from '../../components/ui';

const EMPTY = { fatherName: '', phone: '', email: '', studentIds: [] };

const statusOf = (parent) => {
  if (!parent.active) return ['Inactive', 'neutral'];
  if (parent.activationRequired) return ['Awaiting activation', 'warn'];
  return ['Active', 'success'];
};

export default function ParentsTab({ parents, loading, onChanged }) {
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [activation, setActivation] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState([]);
  const [studentOptionsLoading, setStudentOptionsLoading] = useState(false);
  const [chosenStudents, setChosenStudents] = useState(() => new Map());
  const linkedToAnotherParent = useMemo(() => {
    const linked = new Map();
    for (const parent of parents.filter((item) => item.active && item.id !== editing?.id)) {
      for (const student of parent.students || []) linked.set(String(student.id), parent.fatherName);
    }
    return linked;
  }, [editing?.id, parents]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setChosenStudents(new Map());
    setStudentSearch('');
  };
  const openEdit = (parent) => {
    setEditing(parent);
    const selected = new Map((parent.students || []).map((student) => [String(student.id), { ...student, _id: student.id }]));
    setChosenStudents(selected);
    setForm({
      fatherName: parent.fatherName || '', phone: parent.phone || '', email: parent.email || '',
      studentIds: (parent.students || []).map((student) => student.id),
    });
    setStudentSearch('');
  };
  const close = () => { setEditing(undefined); setForm(EMPTY); setChosenStudents(new Map()); };
  const formOpen = editing !== undefined;

  const loadStudentOptions = useCallback(async () => {
    setStudentOptionsLoading(true);
    try {
      const { data } = await api.get('/students', { params: {
        page: 1, limit: 50, status: 'active', q: studentSearch.trim() || undefined,
      } });
      setStudentOptions(data.students || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not search students');
    } finally {
      setStudentOptionsLoading(false);
    }
  }, [studentSearch]);

  useEffect(() => {
    if (!formOpen) return undefined;
    const timer = window.setTimeout(loadStudentOptions, 250);
    return () => window.clearTimeout(timer);
  }, [formOpen, loadStudentOptions]);

  const visibleStudentOptions = useMemo(() => {
    const combined = new Map(chosenStudents);
    for (const student of studentOptions) combined.set(String(student._id), student);
    return [...combined.values()];
  }, [chosenStudents, studentOptions]);

  const toggleStudent = (student) => {
    const id = String(student._id);
    setForm((current) => ({
      ...current,
      studentIds: current.studentIds.includes(id)
        ? current.studentIds.filter((value) => value !== id)
        : [...current.studentIds, id],
    }));
    setChosenStudents((current) => {
      const next = new Map(current);
      if (form.studentIds.includes(id)) next.delete(id);
      else next.set(id, student);
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = editing
        ? await api.put(`/admin/users/parents/${editing.id}`, form)
        : await api.post('/admin/users/parents', form);
      if (response.data.activationCode) {
        setActivation({
          parentName: form.fatherName,
          code: response.data.activationCode,
          expiresAt: response.data.activationCodeExpire,
        });
      }
      toast.success(editing ? 'Parent account updated' : 'Parent account created');
      close();
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save parent account');
    } finally {
      setSaving(false);
    }
  };

  const issueCode = async (parent) => {
    const message = parent.active
      ? `Issue a new activation code for ${parent.fatherName}? Every existing session will be signed out.`
      : `Reactivate ${parent.fatherName} and issue a new activation code?`;
    if (!window.confirm(message)) return;
    setWorkingId(parent.id);
    try {
      const response = await api.post(`/admin/users/parents/${parent.id}/activation-code`);
      setActivation({
        parentName: parent.fatherName,
        code: response.data.activationCode,
        expiresAt: response.data.activationCodeExpire,
      });
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not issue an activation code');
    } finally {
      setWorkingId(null);
    }
  };

  const archive = async (parent) => {
    if (!window.confirm(`Archive ${parent.fatherName}'s parent account? They will be signed out and cannot log in.`)) return;
    setWorkingId(parent.id);
    try {
      await api.delete(`/admin/users/parents/${parent.id}`);
      toast.success('Parent account archived');
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not archive parent account');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) return <Skeleton height={220} radius={14} />;

  return (
    <section>
      <div className="users-tab-head">
        <div><h2>Parent accounts</h2><p>The office creates access and links each parent to the correct students.</p></div>
        <Button onClick={openCreate}>Add parent</Button>
      </div>

      {!parents.length ? (
        <EmptyState icon="♙" title="No parent accounts" action={<Button onClick={openCreate}>Create the first parent</Button>}>
          Parents cannot register themselves. Create their account here and give them the one-time code.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead><tr><th>Parent</th><th>Contact</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{parents.map((parent) => {
              const [status, variant] = statusOf(parent);
              return (
                <tr key={parent.id}>
                  <td data-label="Parent"><strong>{parent.fatherName}</strong></td>
                  <td data-label="Contact"><div>{parent.phone}</div><small>{parent.email}</small></td>
                  <td data-label="Students">{(parent.students || []).map((student) => student.name).join(', ') || 'None'}</td>
                  <td data-label="Status"><Badge variant={variant}>{status}</Badge></td>
                  <td data-label="Actions"><div className="cell-actions">
                    <Button className="btn--sm" variant="ghost" onClick={() => openEdit(parent)}>Edit</Button>
                    <Button className="btn--sm" variant="ghost" disabled={workingId === parent.id} onClick={() => issueCode(parent)}>
                      {parent.active ? 'Recovery code' : 'Reactivate'}
                    </Button>
                    {parent.active && <Button className="btn--sm" variant="danger" disabled={workingId === parent.id} onClick={() => archive(parent)}>Archive</Button>}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !saving && close()}>
          <form className="modal" style={{ maxWidth: 620 }} onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head"><div><h3 className="modal-title">{editing ? 'Edit parent' : 'Add parent'}</h3><p className="modal-sub">Link the students this account is allowed to see.</p></div></header>
            <div className="modal-fields">
              <label><span className="field-label">Parent name</span><input className="input" required value={form.fatherName} onChange={(event) => setForm({ ...form, fatherName: event.target.value })} /></label>
              <label><span className="field-label">Phone number</span><input className="input" required inputMode="numeric" maxLength={10} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} /></label>
              <label><span className="field-label">Email</span><input className="input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            </div>
            <fieldset className="student-picker"><legend>Linked students</legend>
              <input className="input" type="search" placeholder="Search by student, admission number, parent or hostel…" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
              {studentOptionsLoading && <small>Searching students…</small>}
              {!studentOptionsLoading && !visibleStudentOptions.length && <small>No active students found.</small>}
              {visibleStudentOptions.map((student) => (
                <label key={student._id} className="student-picker__row">
                  <input type="checkbox" disabled={linkedToAnotherParent.has(String(student._id))} checked={form.studentIds.includes(String(student._id))} onChange={() => toggleStudent(student)} />
                  <span><strong>{student.name}</strong><small>{student.admissionNumber || 'No admission number'} · Hostel {student.hostelNumber}{linkedToAnotherParent.has(String(student._id)) ? ` · Linked to ${linkedToAnotherParent.get(String(student._id))}` : ''}</small></span>
                </label>
              ))}
              <small>Up to 50 matches are shown. Search to find students outside the first page.</small>
            </fieldset>
            <div className="modal-actions"><Button variant="ghost" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving || !form.studentIds.length}>{saving ? 'Saving…' : 'Save parent'}</Button></div>
          </form>
        </div>
      )}

      {activation && (
        <div className="modal-backdrop" onClick={() => setActivation(null)}>
          <div className="modal activation-card" style={{ maxWidth: 440 }} onClick={(event) => event.stopPropagation()}>
            <h3 className="modal-title">One-time activation code</h3>
            <Banner variant="warn">Show this code to {activation.parentName} through a trusted channel. It is displayed only here.</Banner>
            <div className="activation-code">{activation.code}</div>
            <p className="modal-note">Expires {new Date(activation.expiresAt).toLocaleString()}. The parent enters it with their phone number, chooses a password, and is signed in.</p>
            <div className="modal-actions"><Button variant="ghost" onClick={() => navigator.clipboard?.writeText(activation.code)}>Copy code</Button><Button onClick={() => setActivation(null)}>Done</Button></div>
          </div>
        </div>
      )}
    </section>
  );
}
