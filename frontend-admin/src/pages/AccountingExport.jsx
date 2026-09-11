import { useState } from 'react';
import toast from 'react-hot-toast';

import { Banner, Button, Card, PageHeader } from '../components/ui';
import {
  EXPORT_FORMATS,
  MOVEMENT_TYPES,
  QUICK_RANGES,
  exportFilename,
  exportedCount,
  includeParam,
  quickRange,
  quickRangeLabel,
} from '../utils/accountingExport';
import api from '../utils/api';

const ALL_TYPES = MOVEMENT_TYPES.map((type) => type.key);

/* The XML download is off at the counter until its accounting mapping has been
 * verified against the school's actual TallyPrime company — nobody has yet
 * created the three ledgers it imports into, and an unverified import writes
 * vouchers that are awkward to unpick. The buttons stay on the page, greyed,
 * rather than being deleted: the endpoint, the builder and its tests are all
 * intact, so turning this back to true is the whole of re-enabling it.
 */
const XML_ENABLED = false;

const AccountingExport = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [included, setIncluded] = useState(ALL_TYPES);
  /* Which button is working, so only the one that was pressed says so and the
     rest simply go quiet rather than all claiming to be downloading. */
  const [busy, setBusy] = useState(null);

  const nothingSelected = included.length === 0;

  const toggle = (key) =>
    setIncluded((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : ALL_TYPES.filter((entry) => current.includes(entry) || entry === key)
    );

  const download = async (formatKey, range, button) => {
    if (nothingSelected) return;
    if (formatKey === 'xml' && !XML_ENABLED) return;
    if (!range.from || !range.to) {
      toast.error('Select both dates');
      return;
    }

    const format = EXPORT_FORMATS[formatKey];
    setBusy(button);
    try {
      const response = await api.get(format.path, {
        params: { ...range, include: includeParam(included) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename(response.headers['content-disposition'], format);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(exportedCount(format, response.headers));
    } catch (error) {
      console.error(error);
      toast.error('Could not create the TallyPrime export. Check the date range and ledger data.');
    } finally {
      setBusy(null);
    }
  };

  // Read at click time, not at render: a console left open past midnight would
  // otherwise keep exporting the day it was opened on.
  const quickDownload = (formatKey, rangeKey) =>
    download(formatKey, quickRange(rangeKey), `${rangeKey}-${formatKey}`);

  const label = (button, idle) => (busy === button ? 'Preparing…' : idle);
  const disabled = Boolean(busy) || nothingSelected;

  return (
    <div className="page">
      <PageHeader title="TallyPrime Export" />

      <Card style={{ maxWidth: 640, marginTop: 20 }}>
        <h2 className="section-title">Include</h2>
        <fieldset className="export-types">
          <legend className="sr-only">Movement types to export</legend>
          {MOVEMENT_TYPES.map((type) => (
            <label key={type.key} className="export-types__row">
              <input
                type="checkbox"
                checked={included.includes(type.key)}
                onChange={() => toggle(type.key)}
              />
              <span>{type.label}</span>
            </label>
          ))}
        </fieldset>
        {nothingSelected && (
          <Banner variant="alert" icon="⛔">
            Select at least one movement type to export.
          </Banner>
        )}
      </Card>

      <Card style={{ maxWidth: 640, marginTop: 20 }}>
        <h2 className="section-title">Quick export</h2>
        {QUICK_RANGES.map((range) => (
          <div key={range.key} className="quick-export__row">
            <div>
              <strong>{range.label}</strong>
              {/* What the button will actually ask for, so nobody has to guess
                  what "this week" resolved to before committing a download. */}
              <small>{quickRangeLabel(quickRange(range.key))}</small>
            </div>
            <div className="quick-export__actions">
              <Button
                variant="success"
                disabled={disabled}
                onClick={() => quickDownload('csv', range.key)}
              >
                {label(`${range.key}-csv`, 'CSV')}
              </Button>
              <Button
                variant="ghost"
                disabled={disabled || !XML_ENABLED}
                onClick={() => quickDownload('xml', range.key)}
              >
                {label(`${range.key}-xml`, 'XML')}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ maxWidth: 640, marginTop: 20 }}>
        <h2 className="section-title">Custom period</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            download('csv', { from, to }, 'period-csv');
          }}
          style={{ display: 'grid', gap: 16 }}
        >
          <div>
            <label className="field-label" htmlFor="tally-from">From</label>
            <input
              id="tally-from"
              className="input"
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="tally-to">Through</label>
            <input
              id="tally-to"
              className="input"
              type="date"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="quick-export__actions">
            <Button type="submit" variant="success" disabled={disabled}>
              {label('period-csv', 'Download transactions CSV')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || !XML_ENABLED}
              onClick={() => download('xml', { from, to }, 'period-xml')}
            >
              {label('period-xml', 'Download TallyPrime XML')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default AccountingExport;
