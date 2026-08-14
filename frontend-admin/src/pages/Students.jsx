import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import Icon from '../components/Icon';
import { formatINR } from '../utils/format';
import { readStudentSheet } from '../utils/readStudentSheet';
import {
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';

/* The student directory.
 *
 * The screen's one job is finding a student, so the table gets the whole page
 * and everything that writes — registering, editing, importing, recharging —
 * happens in a dialog over it. Registration used to sit open beside the table
 * all day for a task performed a few times a term.
 *
 * Five columns, in the order the office reads them: the admission number is
 * what a student quotes when something goes wrong, so it leads. Everything
 * that is not scanned for — father's name, parent contact — lives in the edit
 * dialog rather than in a column nobody sorts by.
 */

const EMPTY_FORM = {
  name: '',
  admissionNumber: '',
  fatherName: '',
  hostelId: '',
  grade: '',
  parentPhoneNumber: '',
};

const SORTABLE_COLUMNS = [
  { key: 'admissionNumber', label: 'Admission No.' },
  { key: 'name', label: 'Name' },
  { key: 'grade', label: 'Grade' },
  { key: 'hostelNumber', label: 'Hostel' },
  { key: 'pocketMoney', label: 'Wallet', align: 'right' },
];

const FORM_FIELDS = [
  { key: 'name', label: 'Student name', placeholder: 'e.g. Asha Rao', required: true },
  // The school's own number, and what a student types at the kiosk — without
  // one they cannot use it at all. Required on this form for that reason, so
  // an imported record that arrived without one has to be given a number
  // before any other edit to it can be saved.
  { key: 'admissionNumber', label: 'Admission number', placeholder: 'e.g. ADM-1042', required: true },
  { key: 'fatherName', label: "Father's name", placeholder: 'e.g. Ramesh Rao', required: true },
  { key: 'grade', label: 'Grade / class', placeholder: 'e.g. 9-B', required: true },
  {
    key: 'parentPhoneNumber',
    label: 'Parent contact number',
    placeholder: 'e.g. 9876543210',
    type: 'tel',
    inputMode: 'numeric',
    required: true,
  },
];

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  `topup-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const ModalHead = ({ title, subtitle, onClose }) => (
  <header className="modal-head">
    <div>
      <h3 className="modal-title">{title}</h3>
      {subtitle && <p className="modal-sub">{subtitle}</p>}
    </div>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
      <Icon name="close" size={20} />
    </button>
  </header>
);

const Students = () => {
  const [students, setStudents] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [hostelFilter, setHostelFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  // Which dialog is open, if any: 'editor' | 'import' | 'topup'.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [topupStudent, setTopupStudent] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupKey, setTopupKey] = useState('');
  const [topupSaving, setTopupSaving] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    setLoading(true);
    setLoadError(false);

    try {
      const [studentsResponse, hostelsResponse] = await Promise.all([
        api.get('/students'),
        api.get('/hostels'),
      ]);
      setStudents(studentsResponse.data);
      setHostels(hostelsResponse.data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEdit = (student) => {
    setEditingId(student._id);
    setFormData({
      name: student.name || '',
      admissionNumber: student.admissionNumber || '',
      fatherName: student.fatherName || '',
      hostelId: student.hostelId || '',
      grade: student.grade || '',
      parentPhoneNumber: student.parentPhoneNumber || '',
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving || archiving) return;
    setEditorOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  /* Dialog housekeeping for all three: Escape closes whichever is on top, and
     the page behind stops scrolling under it. Neither happens while a request
     is in flight — closing then would hide the outcome of something already
     sent. */
  const dialogOpen = editorOpen || importOpen || Boolean(topupStudent);
  const busy = saving || archiving || uploading || topupSaving;

  useEffect(() => {
    if (!dialogOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event) => {
      if (event.key !== 'Escape' || busy) return;
      if (topupStudent) setTopupStudent(null);
      else if (importOpen) setImportOpen(false);
      else {
        setEditorOpen(false);
        setEditingId(null);
        setFormData(EMPTY_FORM);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialogOpen, busy, topupStudent, importOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, formData);
        toast.success('Student profile updated');
      } else {
        await api.post('/students', formData);
        toast.success('Student profile saved');
      }
      setEditorOpen(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to save student record');
    } finally {
      setSaving(false);
    }
  };

  /* Archiving lives at the foot of the edit dialog rather than in the table.
     It was a text link the same size and shape as Edit, one row away from
     whichever student was actually meant. */
  const handleArchive = async () => {
    const student = students.find((row) => row._id === editingId);
    if (!student) return;

    if (student.pocketMoney > 0) {
      toast.error(`Cannot archive: ${formatINR(student.pocketMoney)} is still in the wallet`);
      return;
    }

    const confirmed = window.confirm(
      `Archive ${student.name}? They stop appearing in the directory and cannot use the kiosk.` +
        ' Their financial history is kept.'
    );
    if (!confirmed) return;

    setArchiving(true);
    try {
      await api.delete(`/students/${student._id}`);
      toast.success(`${student.name} archived`);
      setEditorOpen(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to archive student profile');
    } finally {
      setArchiving(false);
    }
  };

  const handleBulkUpload = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (!excelFile) {
      toast.error('Select an Excel sheet first');
      return;
    }

    setUploading(true);

    try {
      const parsed = await readStudentSheet(excelFile);
      const knownCodes = new Set(hostels.filter((hostel) => hostel.active).map((hostel) => hostel.code));
      const unknown = [...new Set(parsed
        .map((student) => String(student.hostelNumber ?? '').trim().toUpperCase())
        .filter((code) => !knownCodes.has(code)))];
      if (unknown.length) {
        throw new Error(`Unknown or inactive hostels: ${unknown.map((code) => code || '(blank)').join(', ')}. Add or correct them before importing.`);
      }
      const response = await api.post('/students/bulk', { students: parsed });

      toast.success('Bulk upload successful');

      // Columns the server would not import — say so, or the sheet looks
      // like it applied in full.
      const ignored = response.data?.ignoredColumns;
      if (ignored?.length) {
        toast.error(
          `Not imported: ${ignored.join(', ')}. Only name, admissionNumber, fatherName, hostelNumber, grade and parentPhoneNumber are read from the sheet.`
        );
      }
      setExcelFile(null);
      form.reset?.();
      setImportOpen(false);
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || error?.message || 'Bulk import failed');
    } finally {
      setUploading(false);
    }
  };

  const openTopUp = async (student) => {
    try {
      const { data } = await api.get(`/students/${student._id}/wallet`);
      setStudents((current) => current.map((item) =>
        item._id === student._id ? { ...item, pocketMoney: data.wallet.balance } : item
      ));
      setTopupStudent({ ...student, pocketMoney: data.wallet.balance });
      setTopupKey(newIdempotencyKey());
      setTopupAmount('');
    } catch (error) {
      console.error(error);
      toast.error('Could not load the current wallet balance');
    }
  };

  const handleTopUp = async (event) => {
    event.preventDefault();
    if (!topupStudent) return;

    if (!topupAmount || Number(topupAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setTopupSaving(true);

    try {
      const response = await api.put(
        `/students/${topupStudent._id}/topup`,
        { amount: Number(topupAmount) },
        { headers: { 'Idempotency-Key': topupKey } }
      );

      const newBalance = response.data.wallet?.balance ?? response.data.newBalance;
      toast.success(`Wallet updated — new balance ${formatINR(newBalance)}`);
      setStudents((current) => current.map((student) =>
        student._id === topupStudent._id ? { ...student, pocketMoney: newBalance } : student
      ));
      setTopupStudent(null);
      setTopupKey('');
      setTopupAmount('');
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Top-up failed');
    } finally {
      setTopupSaving(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const visible = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const filtered = students.filter((student) => {
      if (hostelFilter && student.hostelId !== hostelFilter) return false;
      if (!query) return true;
      return (
        student.name?.toLowerCase().includes(query) ||
        student.hostelNumber?.toString().toLowerCase().includes(query) ||
        student.admissionNumber?.toString().toLowerCase().includes(query)
      );
    });

    return [...filtered].sort((a, b) => {
      const first = a[sortConfig.key] ?? '';
      const second = b[sortConfig.key] ?? '';

      if (typeof first === 'number' && typeof second === 'number') {
        return sortConfig.direction === 'asc' ? first - second : second - first;
      }

      const compared = first.toString().localeCompare(second.toString(), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sortConfig.direction === 'asc' ? compared : -compared;
    });
  }, [students, searchQuery, hostelFilter, sortConfig]);

  const filtering = Boolean(searchQuery.trim() || hostelFilter);
  const editingStudent = editingId ? students.find((row) => row._id === editingId) : null;

  const hostelOptions = hostels.map((hostel) => (
    <option
      key={hostel._id}
      value={hostel._id}
      disabled={!hostel.active && hostel._id !== formData.hostelId}
    >
      {hostel.code}
      {hostel.name ? ` — ${hostel.name}` : ''}
      {hostel.active ? '' : ' (inactive)'}
    </option>
  ));

  return (
    <div className="page">
      <PageHeader
        title="Student Directory"
        subtitle="Find a student, keep their profile current, and top up their wallet."
        actions={
          <div className="header-actions">
            <Button variant="ghost" className="btn--sm" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={16} />
              Import from Excel
            </Button>
            <Button className="btn--sm" onClick={openCreate}>
              <Icon name="plus" size={16} />
              Add Student
            </Button>
          </div>
        }
      />

      <div className="toolbar">
        <div className="toolbar-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            className="toolbar-input"
            aria-label="Search students"
            placeholder="Search by name, admission number or hostel…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <select
          className="input toolbar-select"
          aria-label="Filter by hostel"
          value={hostelFilter}
          onChange={(event) => setHostelFilter(event.target.value)}
        >
          <option value="">All hostels</option>
          {hostels.map((hostel) => (
            <option key={hostel._id} value={hostel._id}>
              {hostel.code}{hostel.name ? ` — ${hostel.name}` : ''}
            </option>
          ))}
        </select>

        <p className="toolbar-count">
          {loading
            ? 'Loading…'
            : filtering
              ? `${visible.length} of ${students.length} students`
              : `${students.length} student${students.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load the student directory. Check your connection and{' '}
          <button type="button" className="link-button" onClick={fetchStudents}>
            try again
          </button>
          .
        </Banner>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🎓"
          title={students.length === 0 ? 'No students yet' : 'No matching students'}
          action={
            students.length === 0 ? (
              <Button onClick={openCreate}>Add the first student</Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => { setSearchQuery(''); setHostelFilter(''); }}
              >
                Clear filters
              </Button>
            )
          }
        >
          {students.length === 0
            ? 'Add one at a time, or import the roll from a spreadsheet.'
            : 'Nothing matches the current search and hostel filter.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                {SORTABLE_COLUMNS.map(({ key, label, align }) => {
                  const active = sortConfig.key === key;
                  return (
                    <th
                      key={key}
                      style={{ padding: 0 }}
                      aria-sort={
                        active
                          ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                          : undefined
                      }
                    >
                      {/* A real button, so the sort can be reached by Tab and
                          fired by Enter or Space. */}
                      <button
                        type="button"
                        className={`th-sort${active ? ' th-sort--active' : ''}${align === 'right' ? ' th-sort--right' : ''}`}
                        onClick={() => handleSort(key)}
                      >
                        {label}
                        {active && (
                          <Icon
                            name="caret"
                            size={14}
                            className={`th-caret${sortConfig.direction === 'asc' ? ' th-caret--up' : ''}`}
                          />
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr key={student._id}>
                  <td data-label="Admission No.">
                    {student.admissionNumber
                      ? <span className="cell-mono">{student.admissionNumber}</span>
                      : <span className="cell-unset">Not set</span>}
                  </td>
                  <td data-label="Name">
                    <span className="cell-name">{student.name}</span>
                  </td>
                  <td data-label="Grade">{student.grade || '—'}</td>
                  <td data-label="Hostel">
                    {student.hostelNumber
                      ? <span className="badge badge--neutral">{student.hostelNumber}</span>
                      : <span className="cell-unset">Not set</span>}
                  </td>
                  <td data-label="Wallet" className="cell-right">
                    <span className={`cell-money${student.pocketMoney > 0 ? '' : ' cell-money--zero'}`}>
                      {formatINR(student.pocketMoney)}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="cell-actions">
                      <Button
                        variant="success"
                        className="btn--sm"
                        onClick={() => openTopUp(student)}
                      >
                        Recharge
                      </Button>
                      <Button
                        variant="ghost"
                        className="btn--sm"
                        onClick={() => openEdit(student)}
                      >
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editorOpen && (
        <div className="modal-backdrop" onClick={closeEditor}>
          <form
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <ModalHead
              title={editingId ? 'Edit Student' : 'Add Student'}
              subtitle={editingId ? editingStudent?.name : 'They can use the kiosk as soon as this is saved.'}
              onClose={closeEditor}
            />

            <div className="modal-fields">
              {FORM_FIELDS.map(({ key, label, ...inputProps }) => (
                <div key={key}>
                  <label className="field-label" htmlFor={`student-${key}`}>{label}</label>
                  <input
                    id={`student-${key}`}
                    className="input"
                    value={formData[key]}
                    onChange={(event) => setFormData({ ...formData, [key]: event.target.value })}
                    {...inputProps}
                  />
                </div>
              ))}

              <div>
                <label className="field-label" htmlFor="student-hostelId">Hostel</label>
                <select
                  id="student-hostelId"
                  className="input"
                  required
                  value={formData.hostelId}
                  onChange={(event) => setFormData({ ...formData, hostelId: event.target.value })}
                >
                  <option value="">Choose a hostel</option>
                  {hostelOptions}
                </select>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" disabled={saving || archiving} onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={editingId ? 'success' : 'primary'}
                disabled={saving || archiving}
              >
                {saving ? 'Saving…' : editingId ? 'Update Student' : 'Save Student'}
              </Button>
            </div>

            {/* Only on an existing record, and kept below the fold of the form
                so it is never the button under a thumb heading for Update. */}
            {editingId && (
              <section className="danger-zone">
                <div>
                  <h4 className="danger-zone__title">Archive this student</h4>
                  <p className="danger-zone__body">
                    {editingStudent?.pocketMoney > 0
                      ? `Not possible yet — ${formatINR(editingStudent.pocketMoney)} is still in the wallet.`
                      : 'They stop appearing in the directory and cannot use the kiosk. Their financial history is kept.'}
                  </p>
                </div>
                <Button
                  variant="danger"
                  className="btn--sm"
                  disabled={archiving || saving || editingStudent?.pocketMoney > 0}
                  onClick={handleArchive}
                >
                  <Icon name="trash" size={16} />
                  {archiving ? 'Archiving…' : 'Archive'}
                </Button>
              </section>
            )}
          </form>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={() => !uploading && setImportOpen(false)}>
          <form
            className="modal"
            style={{ maxWidth: 460 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleBulkUpload}
          >
            <ModalHead
              title="Import from Excel"
              subtitle="Adds the whole roll in one go."
              onClose={() => !uploading && setImportOpen(false)}
            />

            <label className="field-label" htmlFor="student-sheet">Spreadsheet (.xlsx)</label>
            <input
              id="student-sheet"
              type="file"
              accept=".xlsx"
              className="input file-input"
              onChange={(event) => setExcelFile(event.target.files[0])}
            />

            <p className="modal-note">
              Columns read: <strong>name</strong>, <strong>admissionNumber</strong>,{' '}
              <strong>fatherName</strong>, <strong>hostelNumber</strong>, <strong>grade</strong> and{' '}
              <strong>parentPhoneNumber</strong>. Every hostel in the sheet must already exist and be
              active, or the import is refused before anything is written.
            </p>

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" disabled={uploading} onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading || !excelFile}>
                {uploading ? 'Importing…' : 'Import students'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {topupStudent && (
        <div className="modal-backdrop" onClick={() => !topupSaving && setTopupStudent(null)}>
          <form
            className="modal"
            style={{ maxWidth: 380 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleTopUp}
          >
            <ModalHead
              title="Recharge Wallet"
              subtitle={topupStudent.name}
              onClose={() => !topupSaving && setTopupStudent(null)}
            />

            {/* The figure being changed, shown where it is being changed. */}
            <div className="balance-readout">
              <span>Current balance</span>
              <strong>{formatINR(topupStudent.pocketMoney)}</strong>
            </div>

            <label className="field-label" htmlFor="topup-amount">Amount to add (₹)</label>
            <input
              id="topup-amount"
              type="number"
              min="1"
              className="input"
              placeholder="Enter amount"
              autoFocus
              value={topupAmount}
              onChange={(event) => setTopupAmount(event.target.value)}
            />

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" disabled={topupSaving} onClick={() => setTopupStudent(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="success" disabled={topupSaving}>
                {topupSaving ? 'Recharging…' : 'Recharge'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Students;
