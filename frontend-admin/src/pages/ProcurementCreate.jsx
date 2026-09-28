import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { formatINR } from '../utils/format';
import { lastUsedPurchaseRates } from '../utils/purchaseRates';
import { useFeature } from '../utils/currentStaff';
import { Banner, Button, Card, PageHeader, Skeleton } from '../components/ui';

const blankLine = () => ({ productId: '', quantity: '', estimatedUnitCost: '' });

export default function ProcurementCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnedDraft = location.state?.procurementDraft;
  const returnedProduct = location.state?.newProduct;
  const canAddProduct = useFeature('products.add');
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [lastRates, setLastRates] = useState(() => new Map());
  const [supplierId, setSupplierId] = useState(() => returnedDraft?.supplierId || '');
  const [reason, setReason] = useState(() => returnedDraft?.reason || 'Routine inventory replenishment');
  const [lines, setLines] = useState(() => {
    const restored = returnedDraft?.lines?.length ? returnedDraft.lines : [blankLine()];
    if (!returnedProduct?.id) return restored;
    const emptyIndex = restored.findIndex((line) => !line.productId);
    const selected = { productId: returnedProduct.id, quantity: '', estimatedUnitCost: '' };
    return emptyIndex >= 0
      ? restored.map((line, index) => index === emptyIndex ? selected : line)
      : [...restored, selected];
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [supplierResponse, inventoryResponse, ordersResponse] = await Promise.all([
          api.get('/suppliers'),
          api.get('/inventory'),
          api.get('/v1/purchase-orders'),
        ]);
        setSuppliers(Array.isArray(supplierResponse.data) ? supplierResponse.data : []);
        setProducts((Array.isArray(inventoryResponse.data) ? inventoryResponse.data : [])
          .filter((row) => row.productId && row.productId.active !== false)
          .map((row) => ({
            id: row.productId._id,
            name: row.productId.name,
            stock: row.stock,
          })));
        setLastRates(lastUsedPurchaseRates(ordersResponse.data.data || []));
      } catch (error) {
        console.error(error);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, []);

  const selectedProducts = new Set(lines.map((line) => line.productId).filter(Boolean));
  const total = useMemo(() => lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.estimatedUnitCost) || 0),
    0
  ), [lines]);

  const setLine = (index, field, value) => setLines((current) => current.map(
    (line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line
  ));

  const selectProduct = (index, productId) => setLines((current) => current.map(
    (line, lineIndex) => lineIndex === index
      ? {
          ...line,
          productId,
          estimatedUnitCost: lastRates.has(productId) ? String(lastRates.get(productId)) : '',
        }
      : line
  ));

  const removeLine = (index) => setLines((current) =>
    current.length === 1 ? [blankLine()] : current.filter((_, lineIndex) => lineIndex !== index)
  );

  const addNewProduct = () => navigate('/warehouse/products?add=1', {
    state: {
      productCreationReturn: '/warehouse/orders/new',
      procurementDraft: { supplierId, reason, lines },
    },
  });

  const submit = async (event) => {
    event.preventDefault();
    const invalid = !supplierId || !lines.length || lines.some((line) =>
      !line.productId || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 ||
      line.estimatedUnitCost === '' || !Number.isFinite(Number(line.estimatedUnitCost)) ||
      Number(line.estimatedUnitCost) < 0
    );
    if (invalid || selectedProducts.size !== lines.length) {
      toast.error('Choose a supplier and give every unique product a whole quantity and unit cost.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/v1/purchase-orders', {
        supplierId,
        reason: reason.trim(),
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          estimatedUnitCost: Number(line.estimatedUnitCost),
        })),
      });
      toast.success('Order raised and sent for approval');
      navigate('/warehouse/review');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Could not raise the inventory order.');
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page warehouse-page"><Skeleton height={360} radius={16} /></div>;
  }

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Raise Inventory Order"
        subtitle="Create a supplier order, then review and approve it before quantities enter inventory."
        actions={<Button variant="ghost" to="/warehouse/orders">Cancel</Button>}
      />

      {loadError ? (
        <Banner variant="alert" icon="⚠️">Suppliers or products could not be loaded. No order has been created.</Banner>
      ) : (
        <form onSubmit={submit} className="procurement-create-layout">
          <Card className="procurement-create-main">
            <div className="procurement-create-fields">
              <label className="field-label">Supplier
                <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="field-label">Purpose or note
                <input className="input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
            </div>

            <div className="procurement-create-heading">
              <div><h2>Order lines</h2><p>Add each product once with the supplier’s unit rate.</p></div>
              <div className="procurement-create-heading__actions">
                {canAddProduct && <Button variant="ghost" className="btn--sm" onClick={addNewProduct}>+ New catalogue product</Button>}
                <Button variant="ghost" className="btn--sm" onClick={() => setLines((current) => [...current, blankLine()])}>+ Add order line</Button>
              </div>
            </div>

            <div className="procurement-create-lines">
              {lines.map((line, index) => (
                <div className="procurement-create-line" key={index}>
                  <label className="field-label">Product
                    <select className="input" value={line.productId} onChange={(event) => selectProduct(index, event.target.value)}>
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id} disabled={selectedProducts.has(product.id) && product.id !== line.productId}>
                          {product.name} · {product.stock} in stock
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">Quantity
                    <input className="input" type="number" inputMode="numeric" min="1" step="1" value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} />
                  </label>
                  <label className="field-label">Unit cost
                    <input className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="₹" value={line.estimatedUnitCost} onChange={(event) => setLine(index, 'estimatedUnitCost', event.target.value)} />
                  </label>
                  <div className="procurement-line-total"><small>Line total</small><strong>{formatINR((Number(line.quantity) || 0) * (Number(line.estimatedUnitCost) || 0))}</strong></div>
                  <button type="button" className="procurement-remove-line" onClick={() => removeLine(index)} aria-label={`Remove order line ${index + 1}`}>×</button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="procurement-create-summary">
            <p className="warehouse-eyebrow">Order summary</p>
            <div><span>Products</span><strong>{lines.filter((line) => line.productId).length}</strong></div>
            <div><span>Total units</span><strong>{lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)}</strong></div>
            <div className="procurement-grand-total"><span>Estimated value</span><strong>{formatINR(total)}</strong></div>
            <p>The order will enter the review queue. Approval adds all quantities to inventory automatically.</p>
            <Button type="submit" variant="success" block disabled={saving || loadError}>{saving ? 'Raising order…' : 'Raise order for approval'}</Button>
          </Card>
        </form>
      )}
    </div>
  );
}
