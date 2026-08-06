import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { formatINR } from '../utils/format';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';

const EMPTY_FORM = {
  name: '',
  fatherName: '',
  hostelNumber: '',
  grade: '',
  parentPhoneNumber: '',
};

const SORTABLE_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'hostelNumber', label: 'Hostel No.' },
  { key: 'grade', label: 'Grade' },
  { key: 'parentPhoneNumber', label: 'Parent Contact' },
  { key: 'pocketMoney', label: 'Wallet Balance' },
];

const Students = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [topupStudent, setTopupStudent] = useState(null);
  const [topupSaving, setTopupSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, formData);
        toast.success('Student profile updated');
      } else {
        await api.post('/students', formData);
        toast.success('Student profile saved');
      }
      setFormData(EMPTY_FORM);
      setEditingId(null);
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to save student record');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();

    if (!excelFile) {
      toast.error('Select an Excel sheet first');
      return;
    }

    setUploading(true);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        await api.post('/students/bulk', { students: jsonData });

        toast.success('Bulk upload successful');
        setExcelFile(null);
        e.target.reset?.();
        fetchStudents();
      } catch (error) {
        console.error(error);
        toast.error('Bulk import failed');
      } finally {
        setUploading(false);
      }
    };

    reader.onerror = () => {
      toast.error('Could not read the selected file');
      setUploading(false);
    };

    reader.readAsBinaryString(excelFile);
  };

  const handleDelete = async (id, walletBalance) => {
    if (walletBalance > 0) {
      toast.error('Cannot delete: wallet balance is not zero');
      return;
    }

    if (!window.confirm('Remove this student permanently?')) return;

    try {
      await api.delete(`/students/${id}`);
      toast.success('Student removed');
      fetchStudents();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete student profile');
    }
  };

  const handleTopUp = async (e) => {
    e.preventDefault();
    if (!topupStudent) return;

    if (!topupAmount || Number(topupAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setTopupSaving(true);

    try {
      const res = await api.put(`/students/${topupStudent}/topup`, {
        amount: Number(topupAmount),
      });

      toast.success(`Wallet updated — new balance ${formatINR(res.data.newBalance)}`);
      setTopupStudent(null);
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
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredStudents = students.filter((st) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      st.name?.toLowerCase().includes(query) ||
      st.hostelNumber?.toString().toLowerCase().includes(query)
    );
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (!sortConfig.key) return 0;

    let aValue = a[sortConfig.key] ?? '';
    let bValue = b[sortConfig.key] ?? '';

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    }

    return sortConfig.direction === 'asc'
      ? aValue.toString().localeCompare(bValue.toString(), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      : bValue.toString().localeCompare(aValue.toString(), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
  });

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const startEdit = (st) => {
    setEditingId(st._id);
    setFormData({
      name: st.name,
      fatherName: st.fatherName,
      hostelNumber: st.hostelNumber,
      grade: st.grade,
      parentPhoneNumber: st.parentPhoneNumber,
    });
  };

  const formFields = [
    { key: 'name', label: 'Student Name', type: 'text' },
    { key: 'fatherName', label: "Father's Name", type: 'text' },
    { key: 'hostelNumber', label: 'Hostel Room No.', type: 'text' },
    { key: 'grade', label: 'Grade / Class', type: 'text' },
    {
      key: 'parentPhoneNumber',
      label: 'Parent Contact Number',
      type: 'tel',
      inputMode: 'numeric',
    },
  ];

  return (
    <div className="page">
      {topupStudent && (
        <div
          className="modal-backdrop"
          onClick={() => !topupSaving && setTopupStudent(null)}
        >
          <form
            className="modal"
            style={{ maxWidth: 340 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleTopUp}
          >
            <h3 className="modal-title">Recharge Wallet</h3>

            <label className="field-label" htmlFor="topup-amount">
              Amount (₹)
            </label>
            <input
              id="topup-amount"
              type="number"
              min="1"
              className="input"
              placeholder="Enter amount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
            />

            <div className="modal-actions">
              <Button
                type="submit"
                variant="success"
                style={{ flex: 1 }}
                disabled={topupSaving}
              >
                {topupSaving ? 'Recharging…' : 'Recharge'}
              </Button>
              <Button
                variant="ghost"
                style={{ flex: 1 }}
                disabled={topupSaving}
                onClick={() => setTopupStudent(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <PageHeader
        title="Student Directory"
        subtitle="Register students, manage profiles, and recharge wallets."
        actions={
          <form
            onSubmit={handleBulkUpload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              aria-label="Excel sheet for bulk upload"
              style={{ fontSize: 13, color: 'var(--ink-soft)' }}
              onChange={(e) => setExcelFile(e.target.files[0])}
            />
            <Button
              type="submit"
              variant="success"
              className="btn--sm"
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Bulk Upload'}
            </Button>
          </form>
        }
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <Card className="card--tight" style={{ flex: '1 1 280px' }}>
          <h3 className="section-title">
            {editingId ? 'Modify Student Profile' : 'Register New Student'}
          </h3>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {formFields.map(({ key, label, ...inputProps }) => (
              <div key={key}>
                <label className="field-label" htmlFor={`student-${key}`}>
                  {label}
                </label>
                <input
                  id={`student-${key}`}
                  className="input"
                  required
                  placeholder={label}
                  value={formData[key]}
                  onChange={(e) =>
                    setFormData({ ...formData, [key]: e.target.value })
                  }
                  {...inputProps}
                />
              </div>
            ))}

            <Button type="submit" block disabled={saving}>
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Update Record'
                  : 'Save Profile'}
            </Button>

            {editingId && (
              <Button
                variant="ghost"
                block
                onClick={() => {
                  setEditingId(null);
                  setFormData(EMPTY_FORM);
                }}
              >
                Cancel Edit
              </Button>
            )}
          </form>
        </Card>

        <div style={{ flex: '2 1 480px', minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="search"
              className="input"
              aria-label="Search students"
              placeholder="🔍 Search by student name or hostel room…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
              <button
                type="button"
                className="link-button"
                onClick={fetchStudents}
              >
                try again
              </button>
              .
            </Banner>
          ) : sortedStudents.length === 0 ? (
            <EmptyState
              icon="🎓"
              title={
                students.length === 0 ? 'No students yet' : 'No matching students'
              }
            >
              {students.length === 0
                ? 'Register a student with the form to get started.'
                : `Nothing matches "${searchQuery}".`}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table table--stack table--hover">
                <thead>
                  <tr>
                    {SORTABLE_COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        aria-sort={
                          sortConfig.key === key
                            ? sortConfig.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        style={{
                          cursor: 'pointer',
                          userSelect: 'none',
                          background:
                            sortConfig.key === key
                              ? 'var(--border)'
                              : undefined,
                        }}
                      >
                        {label}
                        {getSortIndicator(key)}
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((st) => (
                    <tr key={st._id}>
                      <td data-label="Name">
                        <strong>{st.name}</strong>
                      </td>
                      <td data-label="Father's Name">{st.fatherName}</td>
                      <td data-label="Hostel No.">
                        H-{st.hostelNumber || 'N/A'}
                      </td>
                      <td data-label="Grade">{st.grade}</td>
                      <td data-label="Parent Contact">{st.parentPhoneNumber}</td>
                      <td data-label="Wallet">
                        <span
                          style={{ color: 'var(--success)', fontWeight: 700 }}
                        >
                          {formatINR(st.pocketMoney)}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button
                            type="button"
                            className="link-button"
                            style={{
                              color: 'var(--primary)',
                              textDecoration: 'none',
                              fontSize: 13,
                            }}
                            onClick={() => startEdit(st)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="link-button"
                            style={{
                              color: 'var(--success)',
                              textDecoration: 'none',
                              fontSize: 13,
                            }}
                            onClick={() => {
                              setTopupStudent(st._id);
                              setTopupAmount('');
                            }}
                          >
                            Recharge
                          </button>
                          <button
                            type="button"
                            className="link-button"
                            style={{
                              color: 'var(--danger)',
                              textDecoration: 'none',
                              fontSize: 13,
                            }}
                            onClick={() => handleDelete(st._id, st.pocketMoney)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Students;
