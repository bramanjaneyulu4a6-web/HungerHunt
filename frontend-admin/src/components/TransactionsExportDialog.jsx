/* The Transactions page's Export popup: which types, whose, and over which
 * period, then one CSV of those rows.
 *
 * It opens on what the page is showing — the same period, and the kinds the
 * open tab holds — so "export this" is one click, and anything else is a few
 * ticks away. The period here is its own: changing it does not move the page.
 *
 * The rows come from the same feed the page reads, narrowed on the server by
 * type and by person, so what lands in the file is exactly what the page
 * would list for that selection.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';

import Icon from './Icon';
import ProcessedByPicker from './ProcessedByPicker';
import { Banner, Button } from './ui';
import api from '../utils/api';
import { tickedKeys, useExportStaff } from '../utils/exportStaff';
import { saveFile } from '../utils/download';
import { useDismissableOverlay } from '../utils/overlay';
import { KIND_LABELS, PERIODS, periodRange, rangeLabel, rangeProblem } from '../utils/transactions';
import {
  EXPORT_KINDS,
  buildTransactionsCsv,
  effectiveKinds,
  exportParams,
  transactionsFilename,
  unavailableKinds,
} from '../utils/transactionsExport';

const TransactionsExportDialog = ({ initialPeriod, initialRange, initialKinds, onClose }) => {
  const [period, setPeriod] = useState(initialPeriod);
  const [range, setRange] = useState(initialRange);
  const [kinds, setKinds] = useState(initialKinds);
  const [unticked, setUnticked] = useState([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const people = useExportStaff();
  useDismissableOverlay(() => !busy && onClose());

  const processedBy = tickedKeys(people.keys, unticked);
  // Kinds only the family makes drop out while "No staff" is unticked.
  const blocked = unavailableKinds(processedBy);
  const chosenKinds = effectiveKinds(kinds, processedBy);
  const problem =
    (chosenKinds.length === 0 && 'Select at least one type.') ||
    (!people.loading && !people.failed && processedBy.length === 0 && 'Select at least one person.') ||
    null;

  const choosePeriod = (key) => {
    setPeriod(key);
    setError('');
    // Custom starts from whatever was showing, so the dates are a tweak away.
    if (key !== 'custom') setRange(periodRange(key));
  };

  const toggleKind = (kind) =>
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : EXPORT_KINDS.filter((entry) => current.includes(entry) || entry === kind)
    );

  const submit = async (event) => {
    event.preventDefault();
    if (busy || problem) return;
    // Read quick periods at click time: a popup left open past midnight
    // would otherwise export the day it was opened on.
    const asked = period === 'custom' ? range : periodRange(period);
    const badRange = rangeProblem(asked);
    if (badRange) {
      setError(badRange);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await api.get('/v1/accounting-exports/movements', {
        params: exportParams({
          ...asked,
          kinds: chosenKinds,
          // A list that failed to load is everyone, not no one.
          processedBy: people.failed ? people.keys : processedBy,
          staffKeys: people.keys,
        }),
      });
      const rows = (response.data?.data || []).filter((row) => includeDeleted || !row.deleted);
      if (rows.length === 0) {
        setError('Nothing matches this selection — try a longer period or more types.');
        setBusy(false);
        return;
      }
      saveFile(
        new Blob([buildTransactionsCsv(rows)], { type: 'text/csv;charset=utf-8' }),
        transactionsFilename(asked)
      );
      toast.success(`${rows.length} ${rows.length === 1 ? 'row' : 'rows'} exported`);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Couldn't create the export. Check the period and try again."
      );
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="modal tx-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-export-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id="tx-export-title">Export transactions</h2>
            <p className="modal-sub">Choose what goes into the CSV.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Close" disabled={busy} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <section className="tx-export__section">
          <h3 className="tx-export__heading">Period</h3>
          <div className="tx-period__quick" role="group" aria-label="Export period">
            {PERIODS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`tx-chip${period === option.key ? ' tx-chip--active' : ''}`}
                aria-pressed={period === option.key}
                onClick={() => choosePeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <div className="tx-period__custom tx-export__dates">
              <label>
                <span className="field-label">From</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={range.from}
                  onChange={(event) => setRange({ ...range, from: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">To</span>
                <input
                  className="input"
                  type="date"
                  required
                  value={range.to}
                  onChange={(event) => setRange({ ...range, to: event.target.value })}
                />
              </label>
            </div>
          ) : (
            <p className="export-picker__note">{rangeLabel(periodRange(period))}</p>
          )}
        </section>

        <section className="tx-export__section">
          <h3 className="tx-export__heading">Type</h3>
          <fieldset className="export-types">
            <legend className="sr-only">Transaction types</legend>
            {EXPORT_KINDS.map((kind) => (
              <label
                key={kind}
                className={`export-types__row${blocked.includes(kind) ? ' export-types__row--off' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={chosenKinds.includes(kind)}
                  disabled={blocked.includes(kind)}
                  onChange={() => toggleKind(kind)}
                />
                <span>{KIND_LABELS[kind]}</span>
              </label>
            ))}
          </fieldset>
          {blocked.length > 0 && (
            <p className="export-picker__note">
              Greyed out: no staff member makes these. Tick &ldquo;No staff&rdquo; under Processed by to include them.
            </p>
          )}
        </section>

        <section className="tx-export__section">
          <h3 className="tx-export__heading">Processed by</h3>
          <ProcessedByPicker {...people} unticked={unticked} onChange={setUnticked} />
        </section>

        <label className="export-types__row tx-export__deleted">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
          />
          <span>Include deleted entries (marked Deleted in the file)</span>
        </label>

        {(problem || error) && (
          <Banner variant="alert" icon="⚠️">{problem || error}</Banner>
        )}

        <div className="modal-actions tx-export__actions">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="success" disabled={busy || Boolean(problem) || people.loading}>
            <Icon name="download" size={16} />
            {busy ? 'Preparing…' : 'Download CSV'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default TransactionsExportDialog;
