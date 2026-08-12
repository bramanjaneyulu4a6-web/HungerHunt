import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

const EMPTY_FORM = { name: "", phone: "", contactPerson: "", notes: "" };

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      // Everything, including deactivated — orders reference these rows
      // forever, so removal is a toggle and the history stays visible here.
      const res = await api.get("/suppliers?all=1");
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (supplier) => {
    setForm({
      name: supplier.name || "",
      phone: supplier.phone || "",
      contactPerson: supplier.contactPerson || "",
      notes: supplier.notes || "",
    });
    setEditingId(supplier._id);
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    setSaving(true);

    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        contactPerson: form.contactPerson.trim(),
        notes: form.notes.trim(),
      };

      if (editingId) {
        await api.put(`/suppliers/${editingId}`, body);
        toast.success("Supplier updated");
      } else {
        await api.post("/suppliers", body);
        toast.success("Supplier added");
      }

      setIsFormOpen(false);
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to save supplier"
      );
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (supplier, active) => {
    try {
      await api.put(`/suppliers/${supplier._id}`, { active });
      fetchSuppliers();
      toast.success(active ? "Supplier reactivated" : "Supplier deactivated");
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to update supplier"
      );
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Suppliers"
        subtitle="Who the school buys from. Deactivate rather than delete — orders keep their history."
        actions={<Button onClick={openAdd}>+ Add Supplier</Button>}
      />

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load suppliers. Check your connection and{" "}
          <button type="button" className="link-button" onClick={fetchSuppliers}>
            try again
          </button>
          .
        </Banner>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="🚚"
          title="No suppliers yet"
          action={<Button onClick={openAdd}>+ Add Supplier</Button>}
        >
          Add the people you order from so purchase orders can name them.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Notes</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s._id}>
                  <td data-label="Name">
                    <strong>{s.name}</strong>
                    {s.active === false && (
                      <Badge variant="neutral" style={{ marginLeft: 8 }}>
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td data-label="Contact">{s.contactPerson || "—"}</td>
                  <td data-label="Phone">{s.phone || "—"}</td>
                  <td data-label="Notes">{s.notes || ""}</td>
                  <td data-label="Actions">
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button className="btn--sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        variant={s.active === false ? "success" : "danger"}
                        className="btn--sm"
                        onClick={() => setActive(s, s.active === false)}
                      >
                        {s.active === false ? "Reactivate" : "Deactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFormOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setIsFormOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h3 className="modal-title">{editingId ? "Edit Supplier" : "Add Supplier"}</h3>

            <label className="field-label" htmlFor="supplier-name">
              Name
            </label>
            <input
              id="supplier-name"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-contact">
              Contact Person
            </label>
            <input
              id="supplier-contact"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-phone">
              Phone
            </label>
            <input
              id="supplier-phone"
              type="tel"
              className="input"
              style={{ marginBottom: 14 }}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-notes">
              Notes
            </label>
            <input
              id="supplier-notes"
              type="text"
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <div className="modal-actions">
              <Button type="submit" variant="success" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Supplier"}
              </Button>
              <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
