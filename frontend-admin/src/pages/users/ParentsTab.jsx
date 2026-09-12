import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../../utils/api';
import { Badge, Button, ConfirmDialog, EmptyState, Skeleton } from '../../components/ui';
import { ParentActivityModal } from '../../components/WalletActivity';

const SHOW_RESET_ACCESS = false;

const EMPTY = { fatherName: '', phone: '', email: '', studentIds: [] };

const statusOf = (parent) => {
  if (!parent.active) return ['Inactive', 'neutral'];
  if (parent.activationRequired) return ['Password setup pending', 'warn'];
  return ['Active', 'success'];
};

export default function ParentsTab({ parents, loading, onChanged }) {
  const [searchParams] = useSearchParams();
  const focusedParentId = searchParams.get('focus') || '';
  const [editing, setEditing] = useState(undefined);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  // The parent whose children's wallets are open, if any.
  const [activityParent, setActivityParent] = useState(null);
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

  useEffect(() => {
    if (loading || !focusedParentId) return;
    document.getElementById(`user-parent-${focusedParentId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [focusedParentId, loading, parents]);

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
      editing
        ? await api.put(`/admin/users/parents/${editing.id}`, form)
        : await api.post('/admin/users/parents', form);
      toast.success(editing ? 'Parent account updated' : 'Parent created. They can verify their phone and create a password.');
      close();
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save parent account');
    } finally {
      setSaving(false);
    }
  };

  const requirePasswordSetup = (parent) => setConfirming({
    title: parent.active ? 'Reset access?' : 'Reactivate account?',
    message: parent.active
      ? `Require ${parent.fatherName} to verify their phone and create a new password? Every existing session will be signed out.`
      : `Reactivate ${parent.fatherName}? They will verify their phone by SMS and create a password.`,
    icon: 'refresh',
    variant: 'primary',
    action: async () => {
      setWorkingId(parent.id);
      try {
        await api.post(`/admin/users/parents/${parent.id}/require-password-setup`);
        toast.success(parent.active ? 'New password setup required' : 'Parent account restored');
        await onChanged();
      } catch (error) {
        toast.error(error.response?.data?.message || 'Could not update password setup');
      } finally {
        setWorkingId(null);
      }
    },
  });

  const archive = (parent) => setConfirming({
    title: 'Archive parent account?',
    message: `Archive ${parent.fatherName}'s parent account? They will be signed out and cannot log in.`,
    icon: 'trash',
    variant: 'danger',
    action: async () => {
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
    },
  });

  if (loading) return <Skeleton height={220} radius={14} />;

  return (
    <section>
      <div className="users-tab-head">
        <div><h2>Parent accounts</h2><p>The office creates access and links each parent to the correct students.</p></div>
        <Button onClick={openCreate}>Add parent</Button>
      </div>

      {!parents.length ? (
        <EmptyState icon="♙" title="No parent accounts" action={<Button onClick={openCreate}>Create the first parent</Button>}>
          Parents cannot register themselves. Create their account here; their first sign-in verifies the registered phone by SMS.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead><tr><th>Parent</th><th>Contact</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{parents.map((parent) => {
              const [status, variant] = statusOf(parent);
              return (
                <tr
                  id={`user-parent-${parent.id}`}
                  key={parent.id}
                  className={String(parent.id) === focusedParentId ? 'user-row--focused' : undefined}
                >
                  <td data-label="Parent">
                    <button
                      type="button"
                      className="link-button"
                      style={{ fontWeight: 700 }}
                      onClick={() => setActivityParent(parent)}
                      aria-label={`Open ${parent.fatherName}'s wallet activity`}
                    >
                      {parent.fatherName}
                    </button>
                  </td>
                  <td data-label="Contact"><div>{parent.phone}</div><small>{parent.email || 'No email'}</small></td>
                  <td data-label="Students">
                    {(parent.students || []).length ? (parent.students || []).map((student, index) => (
                      <Fragment key={student.id}>
                        {index > 0 && ', '}
                        <Link
                          className="user-relationship-link"
                          to={`/users/students?focus=${encodeURIComponent(student.id)}&q=${encodeURIComponent(student.admissionNumber || student.name)}`}
                        >
                          {student.name}
                        </Link>
                      </Fragment>
                    )) : 'None'}
                  </td>
                  <td data-label="Status"><Badge variant={variant}>{status}</Badge></td>
                  <td data-label="Actions"><div className="cell-actions">
                    <Button className="btn--sm" variant="ghost" onClick={() => openEdit(parent)}>Edit</Button>
                    {/* Reset access is hidden for now, by the owner's decision
                        (2026-09-12). Reactivate stays: an archived parent has no
                        other way back. Flip SHOW_RESET_ACCESS to bring it back. */}
                    {(SHOW_RESET_ACCESS || !parent.active) && (
                      <Button className="btn--sm" variant="ghost" disabled={workingId === parent.id} onClick={() => requirePasswordSetup(parent)}>
                        {parent.active ? 'Reset access' : 'Reactivate'}
                      </Button>
                    )}
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
              <label><span className="field-label">Email (optional)</span><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            </div>
            <fieldset className="student-picker"><legend>Linked students</legend>
              <input className="input" type="search" placeholder="Search by student, admission number, parent or room…" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
              {studentOptionsLoading && <small>Searching students…</small>}
              {!studentOptionsLoading && !visibleStudentOptions.length && <small>No active students found.</small>}
              {visibleStudentOptions.map((student) => (
                <label key={student._id} className="student-picker__row">
                  <input type="checkbox" disabled={linkedToAnotherParent.has(String(student._id))} checked={form.studentIds.includes(String(student._id))} onChange={() => toggleStudent(student)} />
                  <span><strong>{student.name}</strong><small>{student.admissionNumber || 'No admission number'} · Room {student.roomNumber}{linkedToAnotherParent.has(String(student._id)) ? ` · Linked to ${linkedToAnotherParent.get(String(student._id))}` : ''}</small></span>
                </label>
              ))}
              <small>Up to 50 matches are shown. Search to find students outside the first page.</small>
            </fieldset>
            <div className="modal-actions"><Button variant="ghost" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving || !form.studentIds.length}>{saving ? 'Saving…' : 'Save parent'}</Button></div>
          </form>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          message={confirming.message}
          icon={confirming.icon}
          variant={confirming.variant}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            // Close first, like window.confirm did: the row's button goes
            // disabled through workingId while the request runs, and the
            // toast reports the outcome.
            const { action } = confirming;
            setConfirming(null);
            action();
          }}
        />
      )}
      {activityParent && (
        <ParentActivityModal
          parent={activityParent}
          onClose={() => setActivityParent(null)}
        />
      )}
    </section>
  );
}
