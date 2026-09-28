import { useCallback, useEffect, useState } from 'react';
import { Download, Printer, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { formatINR } from '../utils/format';
import { Banner, Button, Card, EmptyState, Skeleton } from '../components/ui';

const isoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultRange = () => {
  const today = new Date();
  return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(today) };
};

const percentage = (value) => value === null ? 'New' : `${Math.abs(value).toFixed(1)}%`;

const Change = ({ value, suffix = 'vs previous period' }) => {
  const positive = value === null || value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`exec-change exec-change--${positive ? 'up' : 'down'}`}>
      <Icon size={14} aria-hidden="true" />
      {percentage(value)} {suffix}
    </span>
  );
};

const TrendChart = ({ data }) => {
  const width = 760;
  const height = 220;
  const pad = 22;
  const max = Math.max(...data.map((row) => row.revenue), 1);
  const points = data.map((row, index) => ({
    ...row,
    x: data.length === 1 ? width / 2 : pad + (index / (data.length - 1)) * (width - pad * 2),
    y: height - pad - (row.revenue / max) * (height - pad * 2),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;

  return (
    <div className="exec-chart-wrap">
      <svg className="exec-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily sales revenue trend">
        <defs>
          <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity=".22" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line key={ratio} x1={pad} x2={width - pad} y1={height - pad - ratio * (height - pad * 2)} y2={height - pad - ratio * (height - pad * 2)} className="exec-chart-grid" />
        ))}
        <polygon points={area} fill="url(#sales-fill)" />
        <polyline points={line} className="exec-chart-line" />
        {points.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="4" className="exec-chart-point">
            <title>{point.date}: {formatINR(point.revenue)} · {point.orders} orders</title>
          </circle>
        ))}
      </svg>
      <div className="exec-chart-labels">
        <span>{data[0]?.date}</span>
        <span>{data.at(-1)?.date}</span>
      </div>
    </div>
  );
};

const ExecutiveReport = () => {
  const [range, setRange] = useState(defaultRange);
  const [appliedRange, setAppliedRange] = useState(defaultRange);
  const [report, setReport] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/v1/executive-report', { params: appliedRange });
      setReport(response.data.data);
      setMeta(response.data.meta);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The executive report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    const initialLoad = setTimeout(load, 0);
    return () => clearTimeout(initialLoad);
  }, [load]);

  const applyRange = (event) => {
    event.preventDefault();
    if (!range.from || !range.to || range.from > range.to) {
      toast.error('Choose a valid start and end date.');
      return;
    }
    setAppliedRange({ ...range });
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      ['Executive sales report', `${appliedRange.from} to ${appliedRange.to}`],
      [],
      ['Metric', 'Value'],
      ['Net sales', report.summary.revenue],
      ['Orders', report.summary.orders],
      ['Units sold', report.summary.unitsSold],
      ['Customers', report.summary.customers],
      ['Average order value', report.summary.averageOrderValue],
      ['Estimated cost of goods sold', report.summary.estimatedCogs],
      ['Estimated gross profit', report.summary.estimatedGrossProfit],
      ['Estimated gross margin', `${report.summary.estimatedGrossMargin}%`],
      ['Stock purchased', report.procurement.spend],
      ['Damaged stock cost', report.procurement.damagedLoss],
      [],
      ['Top products', 'Units', 'Sales', 'Estimated gross profit'],
      ...report.topProducts.map((product) => [product.name, product.units, product.revenue, product.estimatedProfit]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Executive_Sales_Report_${appliedRange.from}_to_${appliedRange.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summary = report?.summary;
  const comparison = report?.comparison;
  const maxProductRevenue = Math.max(...(report?.topProducts || []).map((row) => row.revenue), 1);

  return (
    <div className="page exec-page">
      <header className="exec-header">
        <div>
          <p className="exec-eyebrow">Chairman’s briefing</p>
          <h1>Executive Sales Report</h1>
          <p>A concise view of sales performance, stock expenses, and commercial health.</p>
        </div>
        <div className="exec-actions no-print">
          <Button variant="ghost" onClick={() => window.print()} disabled={!report}><Printer size={16} /> Print</Button>
          <Button variant="dark" onClick={exportCsv} disabled={!report}><Download size={16} /> Export CSV</Button>
        </div>
      </header>

      <Card className="exec-filter no-print">
        <form onSubmit={applyRange}>
          <label>From<input className="input" type="date" value={range.from} onChange={(event) => setRange((old) => ({ ...old, from: event.target.value }))} /></label>
          <label>To<input className="input" type="date" value={range.to} max={isoDate(new Date())} onChange={(event) => setRange((old) => ({ ...old, to: event.target.value }))} /></label>
          <Button type="submit" variant="primary">Run report</Button>
          <button type="button" className="exec-refresh" onClick={load} aria-label="Refresh report"><RefreshCw size={17} /></button>
        </form>
        {meta?.generatedAt && <small>Updated {new Date(meta.generatedAt).toLocaleString()}</small>}
      </Card>

      {error && <Banner variant="alert">{error}</Banner>}

      {loading && !report ? (
        <div className="exec-loading"><Skeleton height={140} /><Skeleton height={300} /><Skeleton height={260} /></div>
      ) : report && (
        <>
          <section className="exec-kpis" aria-label="Key performance indicators">
            <Card className="exec-kpi exec-kpi--primary">
              <span>Net sales</span><strong>{formatINR(summary.revenue)}</strong>
              <Change value={comparison.revenueChange} />
            </Card>
            <Card className="exec-kpi">
              <span>Estimated gross profit</span><strong>{formatINR(summary.estimatedGrossProfit)}</strong>
              <small>{summary.estimatedGrossMargin.toFixed(1)}% gross margin</small>
            </Card>
            <Card className="exec-kpi">
              <span>Orders</span><strong>{summary.orders.toLocaleString('en-IN')}</strong>
              <Change value={comparison.ordersChange} />
            </Card>
            <Card className="exec-kpi">
              <span>Average order</span><strong>{formatINR(summary.averageOrderValue)}</strong>
              <Change value={comparison.averageOrderValueChange} />
            </Card>
          </section>

          <section className="exec-grid exec-grid--wide">
            <Card className="exec-section">
              <div className="exec-section-head"><div><h2>Sales performance</h2><p>Daily net sales in the selected period</p></div><span className="exec-pill">{summary.unitsSold} units sold</span></div>
              {report.trend.length ? <TrendChart data={report.trend} /> : <EmptyState title="No sales in this period">Choose a different date range to review activity.</EmptyState>}
            </Card>

            <Card className="exec-section exec-snapshot">
              <div className="exec-section-head"><div><h2>Commercial snapshot</h2><p>What leadership should know</p></div></div>
              <dl>
                <div><dt>Unique customers</dt><dd>{summary.customers}</dd></div>
                <div><dt>Cost of goods sold</dt><dd>{formatINR(summary.estimatedCogs)}</dd></div>
                <div><dt>Cost-data coverage</dt><dd>{summary.costCoverage.toFixed(1)}%</dd></div>
                <div><dt>Sales last period</dt><dd>{formatINR(comparison.revenue)}</dd></div>
              </dl>
              <div className="exec-callout">
                <strong>{summary.estimatedGrossMargin >= 25 ? 'Healthy margin position' : 'Margin needs attention'}</strong>
                <p>{summary.estimatedGrossMargin >= 25 ? 'The estimated gross margin is at or above 25% for this period.' : 'Review purchase costs and product pricing; estimated gross margin is below 25%.'}</p>
              </div>
            </Card>
          </section>

          <section className="exec-grid">
            <Card className="exec-section">
              <div className="exec-section-head"><div><h2>Expenses & stock intake</h2><p>Cash committed to inventory received during the period</p></div></div>
              <div className="exec-expense-total"><span>Stock purchased</span><strong>{formatINR(report.procurement.spend)}</strong></div>
              <div className="exec-expense-rows">
                <div><span>Goods received</span><strong>{report.procurement.unitsReceived.toLocaleString('en-IN')} units</strong></div>
                <div><span>Supplier deliveries</span><strong>{report.procurement.invoices.toLocaleString('en-IN')}</strong></div>
                <div className={report.procurement.damagedLoss ? 'exec-loss' : ''}><span>Damaged stock cost</span><strong>{formatINR(report.procurement.damagedLoss)}</strong></div>
              </div>
              <p className="exec-footnote">{report.notes.expenses}</p>
            </Card>

            <Card className="exec-section">
              <div className="exec-section-head"><div><h2>Sales channels</h2><p>Where revenue was generated</p></div></div>
              <div className="exec-channels">
                {report.channels.length ? report.channels.map((channel) => (
                  <div key={channel.name}>
                    <span><i />{channel.name}<small>{channel.orders} orders</small></span>
                    <strong>{formatINR(channel.revenue)}</strong>
                  </div>
                )) : <p className="exec-muted">No channel activity in this period.</p>}
              </div>
            </Card>
          </section>

          <Card className="exec-section exec-products">
            <div className="exec-section-head"><div><h2>Top-selling products</h2><p>Ranked by sales value</p></div></div>
            {report.topProducts.length ? (
              <div className="exec-product-list">
                {report.topProducts.map((product, index) => (
                  <div className="exec-product" key={product.productId || product.name}>
                    <span className="exec-rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="exec-product-name"><strong>{product.name}</strong><span>{product.units} units</span></div>
                    <div className="exec-product-bar"><i style={{ width: `${(product.revenue / maxProductRevenue) * 100}%` }} /></div>
                    <strong>{formatINR(product.revenue)}</strong>
                    <span className="exec-profit">{product.costKnown ? `${formatINR(product.estimatedProfit)} est. profit` : 'Cost unavailable'}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No product sales">Product performance will appear after sales are recorded.</EmptyState>}
          </Card>

          <footer className="exec-report-notes">
            <strong>How to read this report</strong>
            <p>{report.notes.cogs} {report.notes.deletedSales}</p>
          </footer>
        </>
      )}
    </div>
  );
};

export default ExecutiveReport;
