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
  subCategory: 'Others',
  unit: '',
  price: '',
  reorderLevel: '5',
  safetyStock: '0',
  purchaseLimitEnabled: false,
  purchaseLimitQuantity: '',
  purchaseLimitPeriod: 'DAILY',
  nutritionCalories: '',
  nutritionProtein: '',
  nutritionCarbs: '',
  nutritionFat: '',
  nutritionServing: '',
  image: null,
};

// Transcribed off the packet, one box each. All optional and independent —
// the till shows what is filled and dashes the rest — so none is `required`
// and a half-read wrapper still saves.
const NUTRITION_FIELDS = [
  ['nutritionCalories', 'Energy (kcal)', 'e.g., 280'],
  ['nutritionProtein', 'Protein (g)', 'e.g., 3.2'],
  ['nutritionCarbs', 'Carbohydrate (g)', 'e.g., 30.1'],
  ['nutritionFat', 'Fat (g)', 'e.g., 16.4'],
];

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
  const [viewMode, setViewMode] = useState('kiosk');
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [savingGroups, setSavingGroups] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [editorCategoryId, setEditorCategoryId] = useState('');
  const [subCategoryName, setSubCategoryName] = useState('');
  const [draggedSubCategory, setDraggedSubCategory] = useState('');
  const [dragOverSubCategory, setDragOverSubCategory] = useState('');

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

  const openCategoryEditor = () => {
    setEditorCategoryId((current) =>
      stockGroups.some((group) => group._id === current)
        ? current
        : (stockGroups[0]?._id || '')
    );
    setIsGroupOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = new FormData();
      data.append('name', form.name);
      data.append('stockGroup', form.stockGroup);
      data.append('subCategory', form.subCategory.trim() || 'Others');
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
      // Blanks are sent too: an emptied box is the office taking a figure
      // back, and the server reads "" as clear-this-one.
      NUTRITION_FIELDS.forEach(([key]) => data.append(key, form[key]));
      data.append('nutritionServing', form.nutritionServing);
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
      subCategory: product.subCategory || 'Others',
      unit: product.unit?._id || '',
      price: product.price ?? '',
      reorderLevel: String(product.reorderLevel ?? 5),
      safetyStock: String(product.safetyStock ?? 0),
      purchaseLimitEnabled: Boolean(product.purchaseLimit?.enabled),
      purchaseLimitQuantity: product.purchaseLimit?.quantity
        ? String(product.purchaseLimit.quantity)
        : '',
      purchaseLimitPeriod: product.purchaseLimit?.period || 'DAILY',
      // ?? not ||: a stored 0 must fill the box with "0", not read as blank
      // and get cleared by the next save.
      nutritionCalories: String(product.nutrition?.calories ?? ''),
      nutritionProtein: String(product.nutrition?.protein ?? ''),
      nutritionCarbs: String(product.nutrition?.carbs ?? ''),
      nutritionFat: String(product.nutrition?.fat ?? ''),
      nutritionServing: product.nutrition?.serving || '',
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

    setSavingGroups(true);
    try {
      await api.post('/stock-groups', { name: groupName });
      setGroupName('');
      await fetchStockGroups();
      toast.success('Category added');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add category');
    } finally {
      setSavingGroups(false);
    }
  };

  const removeStockGroup = async (group) => {
    const productCount = products.filter(
      (product) => product.stockGroup?._id === group._id
    ).length;

    if (productCount > 0) {
      toast.error('Move all products to another category before removing this category');
      return;
    }
    if (!window.confirm(`Remove the empty category “${group.name}”?`)) return;

    setSavingGroups(true);
    try {
      await api.delete(`/stock-groups/${group._id}`);
      if (selectedGroup === group.name) setSelectedGroup('All');
      await fetchStockGroups();
      toast.success('Category removed');
    } catch (error) {
      console.error(error);
      toast.error(
        error.response?.data?.message || 'Failed to remove category'
      );
    } finally {
      setSavingGroups(false);
    }
  };

  const reorderStockGroup = async (sourceId, targetId, position) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const reordered = [...stockGroups];
    const sourceIndex = reordered.findIndex((group) => group._id === sourceId);
    if (sourceIndex < 0) return;

    const [movedGroup] = reordered.splice(sourceIndex, 1);
    let targetIndex = reordered.findIndex((group) => group._id === targetId);
    if (targetIndex < 0) return;
    if (position === 'after') targetIndex += 1;
    reordered.splice(targetIndex, 0, movedGroup);

    setStockGroups(reordered);
    setSavingGroups(true);

    try {
      await Promise.all(
        reordered.map((group, order) =>
          api.put(`/stock-groups/${group._id}`, { order })
        )
      );
      toast.success('Category order updated');
    } catch (error) {
      console.error(error);
      await fetchStockGroups();
      toast.error('Failed to reorder categories');
    } finally {
      setSavingGroups(false);
    }
  };

  const renameCategory = async (category) => {
    const name = window.prompt('Rename category', category.name)?.trim();
    if (!name || name === category.name) return;
    setSavingGroups(true);
    try {
      await api.put(`/stock-groups/${category._id}`, { name });
      await Promise.all([fetchStockGroups(), fetchProducts()]);
      toast.success('Category renamed');
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to rename category');
    } finally {
      setSavingGroups(false);
    }
  };

  const categorySubCategories = (category) => [
    ...new Set([
      ...(category?.subCategories || []),
      ...products
        .filter((product) => product.stockGroup?._id === category?._id)
        .map((product) => product.subCategory || 'Others'),
      'Others',
    ]),
  ];

  const saveSubCategories = async (category, names, rename = {}) => {
    const previous = stockGroups;
    setStockGroups((current) => current.map((item) =>
      item._id === category._id ? { ...item, subCategories: names } : item
    ));
    setSavingGroups(true);
    try {
      await api.put(`/stock-groups/${category._id}/subcategories`, {
        subCategories: names,
        ...rename,
      });
      await Promise.all([fetchStockGroups(), fetchProducts()]);
    } catch (error) {
      setStockGroups(previous);
      toast.error(error.response?.data?.message || 'Failed to update sub-categories');
      throw error;
    } finally {
      setSavingGroups(false);
    }
  };

  const addSubCategory = async (event) => {
    event.preventDefault();
    const category = stockGroups.find((group) => group._id === editorCategoryId);
    const name = subCategoryName.trim();
    if (!category || !name) return;
    const current = categorySubCategories(category);
    if (current.some((item) => item.toLowerCase() === name.toLowerCase())) {
      toast.error('That sub-category already exists in this category');
      return;
    }
    try {
      await saveSubCategories(category, [...current.filter((item) => item !== 'Others'), name, 'Others']);
      setSubCategoryName('');
      toast.success('Sub-category added');
    } catch {
      // saveSubCategories already restored state and explained the failure.
    }
  };

  const renameSubCategory = async (category, currentName) => {
    const name = window.prompt('Rename sub-category', currentName)?.trim();
    if (!name || name === currentName) return;
    const current = categorySubCategories(category);
    if (current.some((item) => item !== currentName && item.toLowerCase() === name.toLowerCase())) {
      toast.error('That sub-category name is already used in this category');
      return;
    }
    try {
      await saveSubCategories(
        category,
        current.map((item) => item === currentName ? name : item),
        { renameFrom: currentName, renameTo: name }
      );
      toast.success('Sub-category renamed');
    } catch {
      // saveSubCategories handles the error.
    }
  };

  const removeSubCategory = async (category, name) => {
    if (name === 'Others') return;
    const count = products.filter((product) =>
      product.stockGroup?._id === category._id && (product.subCategory || 'Others') === name
    ).length;
    if (count) {
      toast.error('Move these products to another sub-category before removing it');
      return;
    }
    if (!window.confirm(`Remove the empty sub-category “${name}”?`)) return;
    try {
      await saveSubCategories(category, categorySubCategories(category).filter((item) => item !== name));
      toast.success('Sub-category removed');
    } catch {
      // saveSubCategories handles the error.
    }
  };

  const reorderSubCategory = async (category, source, target) => {
    if (!source || !target || source === target) return;
    const names = categorySubCategories(category);
    const sourceIndex = names.indexOf(source);
    const targetIndex = names.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...names];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    try {
      await saveSubCategories(category, reordered);
      toast.success('Sub-category order updated');
    } catch {
      // saveSubCategories handles the error.
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
    return (
      p.name?.toLowerCase().includes(query) ||
      p.subCategory?.toLowerCase().includes(query)
    );
  });

  const subCategorySuggestions = [
    ...new Set(
      (stockGroups.find((group) => group._id === form.stockGroup)?.subCategories || [])
        .concat(products
        .filter((product) => !form.stockGroup || product.stockGroup?._id === form.stockGroup)
        .map((product) => product.subCategory || 'Others')
        )
        .concat(['Others'])
    ),
  ].sort((a, b) => a.localeCompare(b));

  const groupNames = [
    ...new Set([
      ...stockGroups.map((group) => group.name),
      ...products.map((product) => product.stockGroup?.name).filter(Boolean),
    ]),
  ];
  const catalogueGroups = ['All', ...groupNames];
  const kioskProducts = filteredProducts.filter(
    (product) =>
      selectedGroup === 'All' || product.stockGroup?.name === selectedGroup
  );
  const visibleSections = (selectedGroup === 'All' ? groupNames : [selectedGroup])
    .map((name) => ({
      name,
      products: kioskProducts.filter((product) => product.stockGroup?.name === name),
    }))
    .filter((section) => section.products.length > 0);

  visibleSections.forEach((section) => {
    const names = [...new Set(section.products.map((product) => product.subCategory || 'Others'))]
      .sort((a, b) => (a === 'Others') - (b === 'Others') || a.localeCompare(b));
    section.subCategories = names.map((name) => ({
      name,
      products: section.products.filter((product) => (product.subCategory || 'Others') === name),
    }));
  });
  const ungroupedProducts =
    selectedGroup === 'All'
      ? kioskProducts.filter((product) => !product.stockGroup?.name)
      : [];

  if (ungroupedProducts.length > 0) {
    const names = [...new Set(ungroupedProducts.map((product) => product.subCategory || 'Others'))]
      .sort((a, b) => (a === 'Others') - (b === 'Others') || a.localeCompare(b));
    visibleSections.push({
      name: 'Unassigned',
      products: ungroupedProducts,
      subCategories: names.map((name) => ({
        name,
        products: ungroupedProducts.filter((product) => (product.subCategory || 'Others') === name),
      })),
    });
  }

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
        subtitle="Manage products, categories, sub-categories and measurement units."
        actions={
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setIsUnitOpen(true)}>
              + Measurement Unit
            </Button>
            <Button onClick={openProductModal}>+ Add Product</Button>
          </div>
        }
      />

      <div className="catalogue-controls">
        <div className="catalogue-view-toggle" role="group" aria-label="Catalogue view">
          <Button
            variant={viewMode === 'kiosk' ? 'primary' : 'ghost'}
            aria-pressed={viewMode === 'kiosk'}
            onClick={() => setViewMode('kiosk')}
          >
            Kiosk View
          </Button>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'ghost'}
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            List View
          </Button>
        </div>

        <input
          type="search"
          className="input catalogue-search"
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
      ) : viewMode === 'list' ? (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Image</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Sub-category</th>
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
                  <td data-label="Category">{p.stockGroup?.name}</td>
                  <td data-label="Sub-category">{p.subCategory || 'Others'}</td>
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
      ) : (
        <div className="catalogue-kiosk-view">
          <div className="catalogue-group-toolbar">
            <div className="catalogue-group-tabs" role="tablist" aria-label="Categories">
              {catalogueGroups.map((group) => (
                <button
                  type="button"
                  role="tab"
                  key={group}
                  className="catalogue-group-tab"
                  aria-selected={selectedGroup === group}
                  onClick={() => setSelectedGroup(group)}
                >
                  {group}
                  <span>
                    {group === 'All'
                      ? products.length
                      : products.filter((product) => product.stockGroup?.name === group).length}
                  </span>
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              className="catalogue-edit-list"
              onClick={openCategoryEditor}
            >
              Edit
            </Button>
          </div>

          {kioskProducts.length === 0 ? (
            <EmptyState icon="📦" title="No products in this group">
              {searchQuery.trim()
                ? `Nothing in ${selectedGroup} matches "${searchQuery}".`
                : 'Choose another category or add a product.'}
            </EmptyState>
          ) : (
            <div className="catalogue-group-sections">
              {visibleSections.map((section) => (
                <section className="catalogue-group-section" key={section.name}>
                  <header className="catalogue-group-heading">
                    <div>
                      <p>Category</p>
                      <h2>{section.name}</h2>
                    </div>
                    <span>{section.products.length} {section.products.length === 1 ? 'item' : 'items'}</span>
                  </header>

                  <div className="catalogue-subcategory-sections">
                    {section.subCategories.map((subCategory) => (
                      <section className="catalogue-subcategory" key={subCategory.name}>
                        <div className="catalogue-subcategory__heading">
                          <h3>{subCategory.name}</h3>
                          <span>{subCategory.products.length} {subCategory.products.length === 1 ? 'item' : 'items'}</span>
                        </div>
                        <div className="catalogue-product-grid catalogue-product-rail">
                    {subCategory.products.map((product) => (
                      <article
                        className={`catalogue-product-card${product.active === false ? ' catalogue-product-card--archived' : ''}`}
                        key={product._id}
                      >
                        <div className="catalogue-product-image">
                          {product.image ? (
                            <img src={product.image} alt="" />
                          ) : (
                            <span aria-hidden="true">📦</span>
                          )}
                          {product.active === false && <Badge variant="neutral">Archived</Badge>}
                          <div className="catalogue-product-hover-actions">
                            <Button
                              className="btn--sm"
                              onClick={() => handleEditInit(product)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={product.active === false ? 'success' : 'danger'}
                              className="btn--sm"
                              onClick={() => setArchived(product, product.active !== false)}
                            >
                              {product.active === false ? 'Restore' : 'Archive'}
                            </Button>
                          </div>
                        </div>

                        <div className="catalogue-product-body">
                          <div className="catalogue-product-title">
                            <h3>{product.name}</h3>
                            <strong>{formatINR(product.price || 0)}</strong>
                          </div>
                          <p>
                            {product.unit?.symbol || 'No unit'} · Reorder at {product.reorderLevel ?? 5}
                          </p>
                          <dl>
                            <div><dt>Safety stock</dt><dd>{product.safetyStock ?? 0}</dd></div>
                            <div><dt>Student limit</dt><dd>{limitLabel(product)}</dd></div>
                          </dl>

                        </div>
                      </article>
                    ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {isGroupOpen && (() => {
        const selectedCategory = stockGroups.find((group) => group._id === editorCategoryId) || stockGroups[0];
        const subCategories = categorySubCategories(selectedCategory);
        return (
          <div className="modal-backdrop" onClick={() => setIsGroupOpen(false)}>
            <div className="modal category-editor-modal" onClick={(e) => e.stopPropagation()}>
              {modalHeader('Edit Categories', () => setIsGroupOpen(false))}

              <p className="stock-group-editor__help">
                Drag tabs and tiles to set the Kiosk order. Tap any category or sub-category name to rename it.
              </p>

              <div className="category-editor-tabs" role="tablist" aria-label="Category order">
                {stockGroups.map((category) => (
                  <div
                    className={`category-editor-tab${editorCategoryId === category._id ? ' category-editor-tab--active' : ''}${draggedGroupId === category._id ? ' category-editor-tab--dragging' : ''}${dragOverGroupId === category._id ? ' category-editor-tab--target' : ''}`}
                    key={category._id}
                    draggable={!savingGroups}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', category._id);
                      setDraggedGroupId(category._id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverGroupId(category._id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      reorderStockGroup(event.dataTransfer.getData('text/plain') || draggedGroupId, category._id, 'before');
                      setDraggedGroupId(null);
                      setDragOverGroupId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedGroupId(null);
                      setDragOverGroupId(null);
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                    <button type="button" role="tab" aria-selected={editorCategoryId === category._id} onClick={() => setEditorCategoryId(category._id)}>
                      {category.name}
                    </button>
                    <button type="button" className="category-editor-rename" onClick={() => renameCategory(category)} aria-label={`Rename ${category.name}`}>✎</button>
                  </div>
                ))}
              </div>

              {selectedCategory && (
                <section className="subcategory-editor" aria-labelledby="subcategory-editor-title">
                  <header>
                    <div>
                      <p>Sub-categories in</p>
                      <button type="button" id="subcategory-editor-title" onClick={() => renameCategory(selectedCategory)}>
                        {selectedCategory.name} <span aria-hidden="true">✎</span>
                      </button>
                    </div>
                    <Button
                      variant="danger"
                      className="btn--sm"
                      disabled={savingGroups || products.some((product) => product.stockGroup?._id === selectedCategory._id)}
                      onClick={() => removeStockGroup(selectedCategory)}
                    >
                      Remove category
                    </Button>
                  </header>

                  <div className="subcategory-tile-grid">
                    {subCategories.map((name) => {
                      const count = products.filter((product) =>
                        product.stockGroup?._id === selectedCategory._id && (product.subCategory || 'Others') === name
                      ).length;
                      return (
                        <div
                          className={`subcategory-editor-tile${draggedSubCategory === name ? ' subcategory-editor-tile--dragging' : ''}${dragOverSubCategory === name ? ' subcategory-editor-tile--target' : ''}`}
                          key={name}
                          draggable={!savingGroups}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', name);
                            setDraggedSubCategory(name);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverSubCategory(name);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            reorderSubCategory(selectedCategory, event.dataTransfer.getData('text/plain') || draggedSubCategory, name);
                            setDraggedSubCategory('');
                            setDragOverSubCategory('');
                          }}
                          onDragEnd={() => {
                            setDraggedSubCategory('');
                            setDragOverSubCategory('');
                          }}
                        >
                          <span className="subcategory-editor-tile__handle" aria-hidden="true">⠿</span>
                          <button type="button" className="subcategory-editor-tile__name" onClick={() => renameSubCategory(selectedCategory, name)}>
                            {name} <span aria-hidden="true">✎</span>
                          </button>
                          <small>{count} {count === 1 ? 'product' : 'products'}</small>
                          {name !== 'Others' && (
                            <button type="button" className="subcategory-editor-tile__remove" disabled={savingGroups || count > 0} onClick={() => removeSubCategory(selectedCategory, name)} aria-label={`Remove ${name}`}>×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <form className="category-editor-add" onSubmit={addSubCategory}>
                    <label className="field-label" htmlFor="subcategory-name">Add sub-category</label>
                    <div>
                      <input id="subcategory-name" className="input" value={subCategoryName} onChange={(event) => setSubCategoryName(event.target.value)} placeholder="e.g., Biscuits" maxLength="60" required />
                      <Button type="submit" disabled={savingGroups}>Add</Button>
                    </div>
                  </form>
                </section>
              )}

              <form className="category-editor-add category-editor-add--category" onSubmit={addStockGroup}>
                <label className="field-label" htmlFor="group-name">Add category</label>
                <div>
                  <input id="group-name" className="input" required value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g., Food & Snacks" />
                  <Button type="submit" disabled={savingGroups}>Add</Button>
                </div>
              </form>

              <div className="modal-actions"><Button variant="ghost" onClick={() => setIsGroupOpen(false)}>Done</Button></div>
            </div>
          </div>
        );
      })()}

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
                  Category
                </label>
                <select
                  id="product-group"
                  className="select"
                  value={form.stockGroup}
                  onChange={(e) =>
                    setForm({ ...form, stockGroup: e.target.value, subCategory: 'Others' })
                  }
                  required
                >
                  <option value="">Select Category</option>
                  {stockGroups.map((group) => (
                    <option key={group._id} value={group._id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="product-subcategory">
                  Sub-category
                </label>
                <select
                  id="product-subcategory"
                  className="select"
                  required
                  value={form.subCategory}
                  onChange={(e) => setForm({ ...form, subCategory: e.target.value })}
                  disabled={!form.stockGroup}
                >
                  {subCategorySuggestions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <p className="field-help">Manage and reorder these options from Edit Categories.</p>
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
                {/* min 0.01, not 0: the server refuses an unpriced product
                    outright, because the till reads zero as free and hands the
                    goods over. Caught here so the office is told at the box
                    rather than by a rejected save. */}
                <input
                  id="product-price"
                  type="number"
                  min="0.01"
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
                <label className="field-label">Nutrition</label>

                {/* Every box optional. The till prints a dash wherever one is
                    left empty rather than a zero, so a packet read halfway is
                    worth saving. Nothing is calculated from these figures. */}
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
                  As printed on the pack. Leave blank what the pack does not say
                  &mdash; the till shows a dash, not a zero.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  {NUTRITION_FIELDS.map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label className="field-label" htmlFor={`product-${key}`}>
                        {label}
                      </label>
                      <input
                        id={`product-${key}`}
                        type="number"
                        min="0"
                        step="any"
                        className="input"
                        placeholder={placeholder}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="field-label" htmlFor="product-nutritionServing">
                    Serving these figures are per
                  </label>
                  <input
                    id="product-nutritionServing"
                    type="text"
                    maxLength={120}
                    className="input"
                    placeholder="e.g., Per 52g pack"
                    value={form.nutritionServing}
                    onChange={(e) =>
                      setForm({ ...form, nutritionServing: e.target.value })
                    }
                  />
                </div>
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
