import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { formatINR } from '../utils/format';

const EMPTY_FORM = {
  name: '',
  stockGroup: '',
  unit: '',
  price: '',
  reorderLevel: '5',
  safetyStock: '0',
  purchaseLimitEnabled: false,
  purchaseLimitQuantity: '',
  purchaseLimitPeriod: 'DAILY',
  image: null,
};

const LIMIT_PERIODS = [
  ['DAILY', 'per day'],
  ['WEEKLY', 'per week'],
  ['MONTHLY', 'per month'],
  ['TOTAL', 'ever'],
];

const limitLabel = (product) => {
  if (!product.purchaseLimit?.enabled) return '—';

  const period = LIMIT_PERIODS.find(([value]) => value === product.purchaseLimit.period);

  return `${product.purchaseLimit.quantity} ${period ? period[1] : 'per day'}`;
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

  async function fetchProducts() {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get('/products?all=1');
      setProducts(res.data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStockGroups() {
    try {
      const res = await api.get('/stock-groups');
      setStockGroups(res.data);
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchUnits() {
    try {
      const res = await api.get('/units');
      setUnits(res.data);
    } catch (error) {
      console.error(error);
    }
  }

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
      data.append('reorderLevel', form.reorderLevel === '' ? '5' : form.reorderLevel);
      data.append('safetyStock', form.safetyStock === '' ? '0' : form.safetyStock);
      // Always sent, both fields included, so switching the limit off is a
      // change the server sees rather than an omission it ignores.
      data.append('purchaseLimitEnabled', form.purchaseLimitEnabled ? 'true' : 'false');
      if (form.purchaseLimitQuantity !== '') {
        data.append('purchaseLimitQuantity', form.purchaseLimitQuantity);
      }
      data.append('purchaseLimitPeriod', form.purchaseLimitPeriod);
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
      reorderLevel: String(product.reorderLevel ?? 5),
      safetyStock: String(product.safetyStock ?? 0),
      purchaseLimitEnabled: Boolean(product.purchaseLimit?.enabled),
      purchaseLimitQuantity: product.purchaseLimit?.quantity
        ? String(product.purchaseLimit.quantity)
        : '',
      purchaseLimitPeriod: product.purchaseLimit?.period || 'DAILY',
      image: null,
    });
    setIsProductOpen(true);
  };

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const setArchived = async (product, archived) => {
    if (
      archived &&
      !window.confirm(
        `Archive ${product.name}? It disappears from sale everywhere; its stock and history stay, and you can restore it any time.`
      )
    )
      return;

    try {
      await api.put(`/products/${product._id}`, { active: !archived });
      if (editingId === product._id) clearForm();
      toast.success(archived ? 'Product archived' : 'Product restored');
      fetchProducts();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to update product');
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
    <div className="page warehouse-page">
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
                <th style={{ width: 120 }}>Price</th>
                <th style={{ width: 130 }}>Reorder point</th>
                <th style={{ width: 120 }}>Safety stock</th>
                <th style={{ width: 150 }}>Per-student limit</th>
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
                    {p.active === false && (
                      <Badge variant="neutral" style={{ marginLeft: 8 }}>
                        Archived
                      </Badge>
                    )}
                  </td>
                  <td data-label="Stock Group">{p.stockGroup?.name}</td>
                  <td data-label="Unit">{p.unit?.symbol}</td>
                  <td data-label="Price" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    {formatINR(p.price || 0)}
                  </td>
                  <td data-label="Reorder level">{p.reorderLevel ?? 5}</td>
                  <td data-label="Safety stock">{p.safetyStock ?? 0}</td>
                  <td data-label="Per-student limit">{limitLabel(p)}</td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        className="btn--sm"
                        onClick={() => handleEditInit(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant={p.active === false ? 'success' : 'danger'}
                        className="btn--sm"
                        onClick={() => setArchived(p, p.active !== false)}
                      >
                        {p.active === false ? 'Restore' : 'Archive'}
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
                <label className="field-label" htmlFor="product-safety-stock">
                  Safety Stock Buffer
                </label>
                <input
                  id="product-safety-stock"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  required
                  value={form.safetyStock}
                  onChange={(e) => setForm({ ...form, safetyStock: e.target.value })}
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
                {/* Required like its siblings: the backend falls back to
                    price: 0 on a blank, which the till would then sell free. */}
                <input
                  id="product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="product-reorder">
                  Reorder Level (flag when stock falls below this; 0 never flags)
                </label>
                <input
                  id="product-reorder"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  required
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                />
              </div>

              <div>
                <label
                  className="field-label"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  htmlFor="product-limit-enabled"
                >
                  <input
                    id="product-limit-enabled"
                    type="checkbox"
                    checked={form.purchaseLimitEnabled}
                    onChange={(e) =>
                      setForm({ ...form, purchaseLimitEnabled: e.target.checked })
                    }
                  />
                  Cap how many one student may buy
                </label>

                {form.purchaseLimitEnabled && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      marginTop: 12,
                    }}
                  >
                    <div>
                      <label className="field-label" htmlFor="product-limit-quantity">
                        Maximum quantity
                      </label>
                      {/* min 1: the server refuses an enabled limit of zero,
                          because a product nobody may buy is one to archive. */}
                      <input
                        id="product-limit-quantity"
                        type="number"
                        min="1"
                        step="1"
                        className="input"
                        placeholder="e.g., 2"
                        required
                        value={form.purchaseLimitQuantity}
                        onChange={(e) =>
                          setForm({ ...form, purchaseLimitQuantity: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="product-limit-period">
                        Counted
                      </label>
                      <select
                        id="product-limit-period"
                        className="select"
                        value={form.purchaseLimitPeriod}
                        onChange={(e) =>
                          setForm({ ...form, purchaseLimitPeriod: e.target.value })
                        }
                      >
                        {LIMIT_PERIODS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
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
