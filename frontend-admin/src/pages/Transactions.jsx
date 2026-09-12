import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Icon from '../components/Icon';
import { ReceiptButton } from '../components/ReceiptButton';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import api from '../utils/api';
import { formatINR } from '../utils/format';
import {
  KIND_LABELS,
  PERIODS,
  TABS,
  activeFilterCount,
  availableFilters,
  emptyFilters,
  filterRows,
  nextSort,
  periodRange,
  rangeLabel,
  rangeProblem,
  sortRows,
  staffIn,
} from '../utils/transactions';

/* Every rupee that moved in a period, on one screen.
 *
 * The rows come from the same reader the TallyPrime export uses, so this page
 * is the export read before it is downloaded. Sorting, filtering and the tabs
 * all happen here over the period fetched: a day is a few dozen rows, and a
 * period is bounded by the server. The period is the only thing that goes
 * back to the server. */

const COLUMNS = [
  { key: 'at', label: 'Time' },
  { key: 'kind', label: 'Type' },
  { key: 'student', label: 'Student' },
  { key: 'admissionNumber', label: 'Adm. No.' },
  { key: 'className', label: 'Class' },
  { key: 'mode', label: 'Mode' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'balanceAfter', label: 'Wallet after', align: 'right' },
  { key: 'receiptNumber', label: 'Receipt No.' },
  { key: 'reference', label: 'Reference' },
  { key: 'processedBy', label: 'Processed by' },
];

const KIND_BADGE = {
  CASH_DEPOSIT: 'success',
  UPI_DEPOSIT: 'success',
  WALLET_DEDUCTION: 'warn',
  UPI_ORDER_PAYMENT: 'neutral',
  REFUND: 'alert',
};

const timeOf = (iso) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const dateOf = (iso) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));

const classOf = (student) =>
  [student?.className, student?.section].filter(Boolean).join('-') || '—';

const whenOf = (iso) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const UPI_APPS = { phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm' };

/* What opens under a row: the receipt where there is paper to print, the
   basket where money bought something, and the facts a person asks about
   when they ring the office — in the same layout the wallet ledger uses,
   so a row reads the same here as it does on a student's page. */
const RowDetails = ({ row }) => {
  const printable = Boolean(row.adjustmentId || row.reversalId) && row.student.id;
  const facts = [
    ['When', whenOf(row.at)],
    ['Type', `${KIND_LABELS[row.kind] || row.kind} · ${row.mode}`],
    ['Student', row.student.name || 'Deleted student'],
    ['Admission No.', row.student.admissionNumber],
    ['Class', classOf(row.student) === '—' ? null : classOf(row.student)],
    ['Room', row.student.roomNumber],
    ['Amount', `${row.signedAmount < 0 ? '−' : '+'} ${formatINR(row.amount)}`],
    ['Wallet before', row.balanceBefore == null ? null : formatINR(row.balanceBefore)],
    ['Wallet after', row.balanceAfter == null ? null : formatINR(row.balanceAfter)],
    ['Receipt No.', row.receiptNumber],
    ['Order', row.reference],
    ['Gateway Reference', row.gateway?.reference],
    // The bank's settlement reference: the number a parent is given when
    // they ask their own bank where the money went.
    ['UTR', row.gateway?.utr],
    ['Paid with', row.gateway?.upiApp ? UPI_APPS[row.gateway.upiApp] || row.gateway.upiApp : null],
    ['Transaction ID', row.transactionId],
    ['Processed by', row.processedBy],
    ['Reason', row.note],
  ].filter(([, value]) => value);

  return (
    <div className="ledger-detail tx-detail">
      <div className="tx-detail__actions">
        {printable ? (
          <ReceiptButton studentId={row.student.id} entry={row} />
        ) : (
          <span className="cell-unset">
            {row.receiptNumber ? 'No printable receipt for this entry.' : 'No receipt for this entry.'}
          </span>
        )}
      </div>

      {row.items.length > 0 && (
        <table className="table table--stack ledger-detail__items">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'center', width: 80 }}>Qty</th>
              <th style={{ textAlign: 'right', width: 110 }}>Unit price</th>
              <th style={{ textAlign: 'right', width: 120 }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {row.items.map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td data-label="Item" style={{ fontWeight: 600 }}>{item.name}</td>
                <td data-label="Qty" style={{ textAlign: 'center', color: 'var(--muted)' }}>{item.quantity}</td>
                <td data-label="Unit price" style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatINR(item.price)}</td>
                <td data-label="Subtotal" style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="ledger-detail__facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const Transactions = () => {
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState(periodRange('today'));
  // The period the table is currently showing — set on Apply, not on every keystroke.
  const [applied, setApplied] = useState(periodRange('today'));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  /* One filter set per tab. Switching tabs restores that tab's own set, so
     narrowing Deposits to cash does not follow the office over to
     Deductions — and the panel only ever offers the kinds the tab can hold. */
  const [filtersByTab, setFiltersByTab] = useState(() =>
    Object.fromEntries(TABS.map((option) => [option.key, emptyFilters()]))
  );
  const filters = filtersByTab[tab];
  const setFilters = (update) =>
    setFiltersByTab((current) => ({
      ...current,
      [tab]: typeof update === 'function' ? update(current[tab]) : update,
    }));
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(null);
  // Which rows are open, by id. More than one may be, so two entries can be
  // compared side by side; a new period closes them all.
  const [openRows, setOpenRows] = useState(() => new Set());
  const toggleRow = (id) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [sort, setSort] = useState({ key: 'at', direction: 'asc' });

  // The panel closes on a click outside it or on Escape, like a menu.
  useEffect(() => {
    if (!panelOpen) return undefined;
    const onPointer = (event) => {
      if (!panelRef.current?.contains(event.target)) setPanelOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  /* One request per applied period. The handlers that change the period put
     the table into its loading state; the effect only asks and answers, and
     an answer for a period no longer on screen is thrown away. */
  useEffect(() => {
    let ignore = false;
    api
      .get('/v1/accounting-exports/movements', { params: applied })
      .then((response) => {
        if (!ignore) setRows(response.data?.data || []);
      })
      .catch((err) => {
        if (ignore) return;
        setRows([]);
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Couldn't load transactions. Check the period and try again."
        );
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [applied]);

  const showPeriod = useCallback((range) => {
    setLoading(true);
    setError('');
    setOpenRows(new Set());
    setApplied(range);
  }, []);

  const choosePeriod = (key) => {
    setPeriod(key);
    if (key === 'custom') return;
    const range = periodRange(key);
    setCustom(range);
    showPeriod(range);
  };

  const applyCustom = (event) => {
    event.preventDefault();
    const problem = rangeProblem(custom);
    if (problem) {
      setError(problem);
      return;
    }
    showPeriod({ ...custom });
  };

  const visible = useMemo(
    () => sortRows(filterRows(rows, { tab, query, filters }), sort),
    [rows, tab, query, filters, sort]
  );
  const offered = useMemo(() => availableFilters(tab), [tab]);
  // Everyone at the desk in this period, whichever tab is open.
  const staff = useMemo(() => staffIn(rows), [rows]);
  const activeFilters = activeFilterCount(filters);

  // Tiles describe what is on screen, so a filter narrows them too.
  const totals = useMemo(
    () =>
      visible.reduce(
        (sum, row) => {
          if (row.signedAmount >= 0) sum.in += row.signedAmount;
          else sum.out += -row.signedAmount;
          return sum;
        },
        { in: 0, out: 0 }
      ),
    [visible]
  );

  const tabCount = (key) => filterRows(rows, { tab: key }).length;
  const filtered = Boolean(query) || activeFilters > 0;
  const multiDay = applied.from !== applied.to;

  const toggleIn = (field, value) =>
    setFilters((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((entry) => entry !== value)
        : [...current[field], value],
    }));
  const clearAll = () => {
    setQuery('');
    setFilters(emptyFilters());
  };

  return (
    <div className="page">
      <PageHeader
        title="Transactions"
        subtitle={`Every deposit, payment and refund for ${rangeLabel(applied)}.`}
      />

      <Card className="card--tight tx-period">
        <div className="tx-period__quick" role="group" aria-label="Period">
          {PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`tx-chip${period === option.key ? ' tx-chip--active' : ''}`}
              onClick={() => choosePeriod(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <form className="tx-period__custom" onSubmit={applyCustom}>
            <label>
              <span className="field-label">From</span>
              <input
                className="input"
                type="date"
                required
                value={custom.from}
                onChange={(event) => setCustom({ ...custom, from: event.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Through</span>
              <input
                className="input"
                type="date"
                required
                value={custom.to}
                onChange={(event) => setCustom({ ...custom, to: event.target.value })}
              />
            </label>
            <Button type="submit" variant="primary">Show</Button>
          </form>
        )}
      </Card>

      <div className="tabs tx-tabs" role="tablist" aria-label="Transaction views">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={tab === option.key}
            className={`tab${tab === option.key ? ' tab--active' : ''}`}
            onClick={() => { setTab(option.key); setPanelOpen(false); }}
          >
            <span>{option.label}</span>
            {option.hint && <small>{option.hint}</small>}
            {!loading && <b className="tx-tab-count">{tabCount(option.key)}</b>}
          </button>
        ))}
      </div>

      <div className="card-grid tx-tiles">
        <Card className="card--tight">
          <div className="stat-label">Transactions{filtered ? ' (filtered)' : ''}</div>
          <div className="stat-value">{loading ? <Skeleton width={60} height={32} /> : visible.length}</div>
        </Card>
        <Card className="card--tight">
          <div className="stat-label">Money in</div>
          <div className="stat-value tx-in">{loading ? <Skeleton width={120} height={32} /> : formatINR(totals.in)}</div>
        </Card>
        <Card className="card--tight">
          <div className="stat-label">Money out</div>
          <div className="stat-value tx-out">{loading ? <Skeleton width={120} height={32} /> : formatINR(totals.out)}</div>
        </Card>
        <Card className="card--tight">
          <div className="stat-label">Net</div>
          <div className="stat-value">{loading ? <Skeleton width={120} height={32} /> : formatINR(totals.in - totals.out)}</div>
        </Card>
      </div>

      <div className="toolbar">
        <label className="toolbar-search">
          <Icon name="search" size={18} />
          <input
            className="toolbar-input"
            type="search"
            placeholder="Search name, admission no., receipt, order or staff…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="tx-filter" ref={panelRef}>
          <Button
            variant={activeFilters ? 'primary' : 'ghost'}
            aria-expanded={panelOpen}
            aria-controls="tx-filter-panel"
            onClick={() => setPanelOpen((open) => !open)}
          >
            <Icon name="filter" size={16} />
            Filters
            {activeFilters > 0 && <span className="tx-filter__count">{activeFilters}</span>}
          </Button>

          {panelOpen && (
            <div className="tx-filter__panel" id="tx-filter-panel" role="dialog" aria-label={`Filters for ${TABS.find((option) => option.key === tab)?.label}`}>
              <div className="tx-filter__head">
                <strong>Filters</strong>
                <small>{TABS.find((option) => option.key === tab)?.label}</small>
              </div>

              <fieldset className="tx-filter__group">
                <legend>Type</legend>
                {offered.kinds.map((value) => (
                  <label key={value} className="tx-filter__option">
                    <input
                      type="checkbox"
                      checked={filters.kinds.includes(value)}
                      onChange={() => toggleIn('kinds', value)}
                    />
                    <span>{KIND_LABELS[value]}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="tx-filter__group">
                <legend>Mode</legend>
                {offered.modes.map((value) => (
                  <label key={value} className="tx-filter__option">
                    <input
                      type="checkbox"
                      checked={filters.modes.includes(value)}
                      onChange={() => toggleIn('modes', value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="tx-filter__group">
                <legend>Amount</legend>
                <div className="tx-filter__range">
                  <label>
                    <span className="field-label">Min ₹</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={filters.min}
                      onChange={(event) => setFilters({ ...filters, min: event.target.value })}
                    />
                  </label>
                  <label>
                    <span className="field-label">Max ₹</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={filters.max}
                      onChange={(event) => setFilters({ ...filters, max: event.target.value })}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="tx-filter__group">
                <legend>Processed by</legend>
                {staff.length === 0 ? (
                  <p className="tx-filter__none">No staff processed anything in this period.</p>
                ) : (
                  staff.map(({ name, count }) => (
                    <label key={name} className="tx-filter__option">
                      <input
                        type="checkbox"
                        checked={filters.processedBy.includes(name)}
                        onChange={() => toggleIn('processedBy', name)}
                      />
                      <span>{name}</span>
                      <b className="tx-filter__tally">{count}</b>
                    </label>
                  ))
                )}
              </fieldset>

              <div className="tx-filter__actions">
                <Button variant="ghost" className="btn--sm" disabled={!activeFilters} onClick={() => setFilters(emptyFilters())}>
                  Clear
                </Button>
                <Button variant="primary" className="btn--sm" onClick={() => setPanelOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
        {filtered && (
          <Button variant="ghost" className="btn--sm" onClick={clearAll}>
            Clear all
          </Button>
        )}
        <span className="toolbar-count">
          {loading ? 'Loading…' : `${visible.length} of ${rows.length} shown`}
        </span>
      </div>

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 16 }}>{error}</Banner>
      )}

      {!loading && !error && visible.length === 0 ? (
        <EmptyState
          icon="₹"
          title={rows.length === 0 ? 'No transactions in this period' : 'Nothing matches these filters'}
          action={filtered ? <Button variant="ghost" onClick={clearAll}>Clear filters</Button> : undefined}
        >
          {rows.length === 0
            ? 'Deposits, wallet payments and refunds will appear here as they happen.'
            : 'Try a different search or loosen the filters.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover tx-table">
            <thead>
              <tr>
                {COLUMNS.map(({ key, label, align }) => {
                  const active = sort.key === key;
                  return (
                    <th
                      key={key}
                      style={{ padding: 0 }}
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <button
                        type="button"
                        className={`th-sort${active ? ' th-sort--active' : ''}${align === 'right' ? ' th-sort--right' : ''}`}
                        onClick={() => setSort((current) => nextSort(current, key))}
                      >
                        {label}
                        {active && (
                          <Icon
                            name="caret"
                            size={14}
                            className={`th-caret${sort.direction === 'asc' ? ' th-caret--up' : ''}`}
                          />
                        )}
                      </button>
                    </th>
                  );
                })}
                <th aria-label="Details" style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map((index) => (
                    <tr key={index}>
                      {COLUMNS.map((column) => (
                        <td key={column.key}><Skeleton height={14} /></td>
                      ))}
                      <td />
                    </tr>
                  ))
                : visible.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="ledger-row--expandable"
                      aria-expanded={openRows.has(row.id)}
                      onClick={() => toggleRow(row.id)}
                    >
                      <td data-label="Time" className="cell-mono">
                        {multiDay && <span className="tx-date">{dateOf(row.at)} </span>}
                        {timeOf(row.at)}
                      </td>
                      <td data-label="Type">
                        <Badge variant={KIND_BADGE[row.kind] || 'neutral'}>{KIND_LABELS[row.kind] || row.kind}</Badge>
                      </td>
                      <td data-label="Student" className="cell-name">
                        {row.student.name || <span className="cell-unset">Deleted student</span>}
                      </td>
                      <td data-label="Adm. No." className="cell-mono">{row.student.admissionNumber || '—'}</td>
                      <td data-label="Class">{classOf(row.student)}</td>
                      <td data-label="Mode">{row.mode}</td>
                      <td data-label="Amount" className={`tx-amount ${row.signedAmount < 0 ? 'tx-out' : 'tx-in'}`}>
                        {row.signedAmount < 0 ? '−' : '+'} {formatINR(row.amount)}
                      </td>
                      <td data-label="Wallet after" className="tx-amount">
                        {row.balanceAfter == null ? '—' : formatINR(row.balanceAfter)}
                      </td>
                      <td data-label="Receipt No." className="cell-mono">{row.receiptNumber || '—'}</td>
                      <td data-label="Reference" className="cell-mono">
                        {row.reference || '—'}
                        {row.note && <small className="tx-note">{row.note}</small>}
                      </td>
                      <td data-label="Processed by">{row.processedBy || <span className="cell-unset">—</span>}</td>
                      <td className="ledger-actions">
                        <span
                          className={`ledger-chevron${openRows.has(row.id) ? ' ledger-chevron--open' : ''}`}
                          aria-hidden="true"
                        >
                          <Icon name="caret" size={16} />
                        </span>
                      </td>
                    </tr>
                    {openRows.has(row.id) && (
                      <tr className="ledger-detail-row">
                        <td colSpan={COLUMNS.length + 1}>
                          <RowDetails row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Transactions;
