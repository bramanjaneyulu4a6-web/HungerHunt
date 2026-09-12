import { useCallback, useEffect, useMemo, useState } from 'react';

import Icon from '../components/Icon';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import api from '../utils/api';
import { formatINR } from '../utils/format';
import {
  KIND_LABELS,
  MODES,
  PERIODS,
  TABS,
  filterRows,
  nextSort,
  periodRange,
  rangeLabel,
  rangeProblem,
  sortRows,
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
  const [kind, setKind] = useState('');
  const [mode, setMode] = useState('');
  const [sort, setSort] = useState({ key: 'at', direction: 'asc' });

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
    () => sortRows(filterRows(rows, { tab, query, kind, mode }), sort),
    [rows, tab, query, kind, mode, sort]
  );

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
  const filtered = Boolean(query || kind || mode);
  const multiDay = applied.from !== applied.to;

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
            onClick={() => setTab(option.key)}
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
        <select className="select toolbar-select" value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select className="select toolbar-select" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Filter by mode">
          <option value="">All modes</option>
          {MODES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {filtered && (
          <Button variant="ghost" className="btn--sm" onClick={() => { setQuery(''); setKind(''); setMode(''); }}>
            Clear filters
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
          action={filtered ? <Button variant="ghost" onClick={() => { setQuery(''); setKind(''); setMode(''); }}>Clear filters</Button> : undefined}
        >
          {rows.length === 0
            ? 'Deposits, wallet payments and refunds will appear here as they happen.'
            : 'Try a different search, type or mode.'}
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
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map((index) => (
                    <tr key={index}>
                      {COLUMNS.map((column) => (
                        <td key={column.key}><Skeleton height={14} /></td>
                      ))}
                    </tr>
                  ))
                : visible.map((row) => (
                    <tr key={row.id}>
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
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Transactions;
