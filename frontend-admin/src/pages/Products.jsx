import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import {
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';

const EMPTY_FORM = {
  name: '',
  stockGroup: '',
  unit: '',
  price: '',
  image: null,
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [stockGroups, setStockGroups] = useState([]);
  const [units, setUnits] = useState([]);

  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [unitForm, setUnitForm] = useState({ name: '', symbol: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchStockGroups();
    fetchUnits();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockGroups = async () => {
    try {
      const res = await api.get('/stock-groups');
      setStockGroups(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await api.get('/units');
      setUnits(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const openProductModal = () => {
    clearForm();
    setIsProductOpen(true);
    // The selects come from their own endpoints; refetch if either list
    // failed to load at mount so the form isn't silently unusable.
    if (stockGroups.length === 0) fetchStockGroups();
    if (units.length === 0) fetchUnits();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = new FormData();
      data.append('name', form.name);
      data.append('stockGroup', form.stockGroup);
      data.append('unit', form.unit);
      data.append('price', form.price);
      if (form.image) {
        data.append('image', form.image);
      }

      if (editingId) {
        await api.put(`/products/${editingId}`, data);
        toast.success('Product updated');
      } else {
        await api.post('/products', data);
        toast.success('Product added');
      }

      clearForm();
      setIsProductOpen(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleEditInit = (product) => {
    setEditingId(product._id);
    setForm({
      name: product.name || '',
      stockGroup: product.stockGroup?._id || '',
      unit: product.unit?._id || '',
      price: product.price ?? '',
      image: null,
    });
    setIsProductOpen(true);
  };

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product permanently?')) return;

    try {
      await api.delete(`/products/${id}`);
      if (editingId === id) clearForm();
      toast.success('Product deleted');
      fetchProducts();
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete product');
    }
  };

  const addStockGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      await api.post('/stock-groups', { name: groupName });
      setGroupName('');
      fetchStockGroups();
      setIsGroupOpen(false);
      toast.success('Stock group added');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add stock group');
    }
  };

  const addUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;

    try {
      await api.post('/units', unitForm);
      setUnitForm({ name: '', symbol: '' });
      fetchUnits();
      setIsUnitOpen(false);
      toast.success('Unit added');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add unit');
    }
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    return p.name?.toLowerCase().includes(query);
  });

  const modalHeader = (title, onClose) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
        paddingBottom: 12,
        borderBottom: '1px solid var(--bg-subtle)',
      }}
    >
      <h3 className="modal-title" style={{ margin: 0 }}>
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        style={{
          background: 'none',
          border: 'none',
          fontSize: 20,
          color: 'var(--muted-soft)',
          cursor: 'pointer',
        }}
      >
        &times;
      </button>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Product Catalog"
        subtitle="Manage products, stock groups and measurement units."
        actions={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setIsGroupOpen(true)}>
              + Stock Group
            </Button>
            <Button variant="ghost" onClick={() => setIsUnitOpen(true)}>
              + Measurement Unit
            </Button>
            <Button onClick={openProductModal}>+ Add Product</Button>
          </div>
        }
      />

      <div style={{ marginBottom: 20 }}>
        <input
          type="search"
          className="input"
          aria-label="Search products"
          placeholder="🔍 Search products…"
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
          Couldn't load the product catalog. Check your connection and{' '}
          <button type="button" className="link-button" onClick={fetchProducts}>
            try again
          </button>
          .
        </Banner>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon="📦"
          title={searchQuery.trim() ? 'No matching products' : 'No products yet'}
          action={
            !searchQuery.trim() && (
              <Button onClick={openProductModal}>+ Add Product</Button>
            )
          }
        >
          {searchQuery.trim()
            ? `Nothing matches "${searchQuery}".`
            : 'Add your first product to start selling.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Image</th>
                <th>Product Name</th>
                <th>Stock Group</th>
                <th>Unit</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p._id}>
                  <td data-label="Image">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <span style={{ color: 'var(--muted-soft)' }}>No image</span>
                    )}
                  </td>
                  <td data-label="Product">
                    <strong>{p.name}</strong>
                  </td>
                  <td data-label="Stock Group">{p.stockGroup?.name}</td>
                  <td data-label="Unit">{p.unit?.symbol}</td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        className="btn--sm"
                        onClick={() => handleEditInit(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        className="btn--sm"
                        onClick={() => handleDelete(p._id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isGroupOpen && (
        <div className="modal-backdrop" onClick={() => setIsGroupOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={addStockGroup}
          >
            {modalHeader('Quick Add: Stock Group', () => setIsGroupOpen(false))}

            <label className="field-label" htmlFor="group-name">
              Stock Group Name
            </label>
            <input
              id="group-name"
              type="text"
              className="input"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Bakery, Snacks"
            />

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setIsGroupOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Group</Button>
            </div>
          </form>
        </div>
      )}

      {isUnitOpen && (
        <div className="modal-backdrop" onClick={() => setIsUnitOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={addUnit}
          >
            {modalHeader('Quick Add: Measurement Unit', () =>
              setIsUnitOpen(false)
            )}

            <label className="field-label" htmlFor="unit-name">
              Unit Name
            </label>
            <input
              id="unit-name"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              required
              value={unitForm.name}
              onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
              placeholder="e.g., Kilogram, Litre"
            />

            <label className="field-label" htmlFor="unit-symbol">
              Unit Symbol
            </label>
            <input
              id="unit-symbol"
              type="text"
              className="input"
              required
              value={unitForm.symbol}
              onChange={(e) =>
                setUnitForm({ ...unitForm, symbol: e.target.value })
              }
              placeholder="e.g., kg, L, pcs"
            />

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setIsUnitOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Unit</Button>
            </div>
          </form>
        </div>
      )}

      {isProductOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (saving) return;
            setIsProductOpen(false);
            clearForm();
          }}
        >
          <form
            className="modal"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSave}
          >
            {modalHeader(
              editingId ? '📝 Edit Product' : 'Add Product',
              () => {
                setIsProductOpen(false);
                clearForm();
              }
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="field-label" htmlFor="product-name">
                  Product Name
                </label>
                <input
                  id="product-name"
                  type="text"
                  className="input"
                  placeholder="e.g., Banana Cake"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="product-group">
                  Stock Group
                </label>
                <select
                  id="product-group"
                  className="select"
                  value={form.stockGroup}
                  onChange={(e) =>
                    setForm({ ...form, stockGroup: e.target.value })
                  }
                  required
                >
                  <option value="">Select Stock Group</option>
                  {stockGroups.map((group) => (
                    <option key={group._id} value={group._id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="product-unit">
                  Unit
                </label>
                <select
                  id="product-unit"
                  className="select"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  required
                >
                  <option value="">Select Unit</option>
                  {units.map((unit) => (
                    <option key={unit._id} value={unit._id}>
                      {unit.symbol} ({unit.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="product-price">
                  Selling Price (₹)
                </label>
                <input
                  id="product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="product-image">
                  Product Image
                </label>
                <input
                  id="product-image"
                  type="file"
                  accept="image/*"
                  className="input"
                  onChange={(e) =>
                    setForm({ ...form, image: e.target.files[0] })
                  }
                />
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setIsProductOpen(false);
                  clearForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={editingId ? 'success' : 'primary'}
                disabled={saving}
              >
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Update Product'
                    : 'Save Product'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Products;
