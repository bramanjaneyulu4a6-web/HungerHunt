import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import HandoverResult from '../components/HandoverResult';
import Icon from '../components/Icon';
import { Banner, Skeleton } from '../components/ui';
import api from '../utils/api';
import {
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  REPORT_STATUS_BADGE,
  REPORT_STATUS_LABELS,
} from '../utils/reports';
import {
  STUDENT_ISSUE_OPTIONS,
  buildReportBody,
  issueNeedsItems,
  selectionProblem,
  setItemCount,
} from '../utils/studentReport';

const CODE_LENGTH = 4;

/* The screen the caretaker turns toward the student.
 *
 * Everything on it is addressed to the student, not the caretaker: their name
 * and admission number so they know this is their package, the receipt so they
 * can check it against what they ordered, the code field because their own
 * four digits — the same ones they use at the till — are the only thing that
 * marks the package collected. Help sits in the corner for the moment the
 * package in front of them does not match the receipt; reporting never holds
 * the package, so the way back always lands on the code field. */
const CollectOrder = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order);
  const [missing, setMissing] = useState(false);

  const [screen, setScreen] = useState('code');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [category, setCategory] = useState(null);
  const [selection, setSelection] = useState({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const [reports, setReports] = useState([]);
  const [overlay, setOverlay] = useState(null);

  /* The reports already standing against this order, student-raised only. The
     list is read by the student holding the phone, so the caretaker's own
     channel about the same package never appears in it. Failing to load it
     costs a footnote, not the handover — so a failure here is silent. */
  const loadReports = useCallback(async () => {
    try {
      const response = await api.get(
        `/v1/caretaker/fulfillment-orders/${orderId}/student-reports`
      );
      setReports(response.data.data || []);
    } catch (error) {
      console.error(error);
    }
  }, [orderId]);

  useEffect(() => { (async () => { await loadReports(); })(); }, [loadReports]);

  /* Opened by URL rather than by tap — a refresh, or the app restarted on the
     caretaker's phone. The list endpoint already carries everything this
     screen shows, and the package must still be with the caretaker to be
     collectable at all. */
  useEffect(() => {
    if (order) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get('/v1/caretaker/fulfillment-orders');
        if (cancelled) return;
        const found = (response.data.data || []).find(
          (candidate) => candidate.id === orderId && candidate.status === 'DELIVERED'
        );
        if (found) setOrder(found);
        else setMissing(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order, orderId]);

  const collect = async (event) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      await api.post(`/v1/caretaker/fulfillment-orders/${orderId}/collect`, { code });
      setOverlay({ type: 'collected' });
    } catch (error) {
      console.error(error);
      /* The server's sentence, read out as-is: "wrong code" sends the phone
         back to the student, "locked" stops the guessing. */
      toast.error(error.response?.data?.message || 'Could not confirm this collection');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const chooseIssue = (value) => {
    setCategory(value);
    setSelection({});
    setNote('');
    setScreen('form');
  };

  const sendReport = async (event) => {
    event.preventDefault();
    if (sending || selectionProblem(category, selection, note)) return;
    setSending(true);
    try {
      const response = await api.post(
        `/v1/caretaker/fulfillment-orders/${orderId}/student-report`,
        buildReportBody(category, selection, note)
      );
      setOverlay({ type: 'report', number: response.data.data?.reportNumber });
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Could not send this report');
    } finally {
      setSending(false);
    }
  };

  const closeOverlay = () => {
    if (overlay?.type === 'collected') {
      navigate('/', { replace: true });
      return;
    }
    loadReports();
    setCategory(null);
    setSelection({});
    setNote('');
    setScreen('code');
    setOverlay(null);
  };

  if (loading) {
    return (
      <main className="wh-page">
        <Skeleton height={320} radius={14} />
      </main>
    );
  }

  if (missing || !order) {
    return (
      <main className="wh-page">
        <Banner variant="alert" icon="⚠️">
          This package is not waiting to be collected. It may already be with its student.
        </Banner>
        <button type="button" className="wh-cta" onClick={() => navigate('/', { replace: true })}>
          Back to packages
        </button>
      </main>
    );
  }

  const firstName = order.student.name.split(' ')[0];
  const optionLabel = STUDENT_ISSUE_OPTIONS.find(([value]) => value === category)?.[1];
  const problem = category ? selectionProblem(category, selection, note) : null;
  const trimmedNote = note.trim();

  return (
    <main className="wh-page wh-handover">
      <div className="wh-handover-bar">
        <button
          type="button"
          className="wh-icon-btn"
          aria-label={screen === 'code' ? 'Back to packages' : 'Back'}
          onClick={() => {
            if (screen === 'form') setScreen('options');
            else if (screen === 'options') setScreen('code');
            else navigate('/');
          }}
        >
          <Icon name="arrowLeft" size={22} />
        </button>
        <h1 className="wh-title wh-handover-title">
          {screen === 'code' ? 'Complete order' : 'Help'}
        </h1>
        {screen === 'code' ? (
          <button type="button" className="wh-help-btn" onClick={() => setScreen('options')}>
            <Icon name="help" size={18} />
            <span>Help</span>
          </button>
        ) : (
          <span className="wh-handover-bar-spacer" aria-hidden="true" />
        )}
      </div>

      {screen === 'code' && (
        <>
          <section className="wh-card wh-handover-student" aria-label="Whose package this is">
            <div className="wh-handover-avatar" aria-hidden="true">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="wh-who">{order.student.name}</span>
              <p className="wh-remaining wh-handover-sub">
                {order.student.admissionNumber || 'No admission number'} · Room{' '}
                {order.student.roomNumber}
              </p>
            </div>
          </section>

          <section className="wh-card" aria-label="Order receipt">
            <p className="wh-field-label">Your order</p>
            <div className="wh-summary wh-summary--lines">
              {order.items.map((item) => (
                <div key={item.productId} className="wh-order-line">
                  <span className="wh-order-line-name">{item.name}</span>
                  <strong className="wh-order-line-qty wh-num">×{item.quantity}</strong>
                </div>
              ))}
            </div>
          </section>

          <form className="wh-card wh-handover-code" onSubmit={collect}>
            <label className="wh-collect-label" htmlFor="handover-code">
              {firstName}, type your purchase code to complete the order
            </label>
            <div className="wh-collect-row">
              <input
                id="handover-code"
                className="wh-input wh-collect-input"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                }
                inputMode="numeric"
                autoComplete="off"
                type="password"
                placeholder="••••"
                disabled={busy}
              />
              <button
                type="submit"
                className="wh-cta wh-collect-cta"
                disabled={code.length !== CODE_LENGTH || busy}
              >
                {busy ? 'Checking…' : 'Order complete'}
              </button>
            </div>
          </form>

          {reports.length > 0 && (
            <section className="wh-card wh-handover-reports" aria-label="Reports on this order">
              <p className="wh-field-label">Reports on this order</p>
              {reports.map((report) => (
                <article key={report.id} className="wh-handover-report">
                  <div className="wh-handover-report-head">
                    <strong className="wh-handover-report-number wh-num">
                      #{report.reportNumber ?? '—'}
                    </strong>
                    <span className="wh-handover-report-label">
                      {STUDENT_ISSUE_OPTIONS.find(([value]) => value === report.category)?.[1] ||
                        report.categoryLabel}
                    </span>
                    <span className={`wh-badge wh-badge--${REPORT_STATUS_BADGE[report.status] || 'new'}`}>
                      {REPORT_STATUS_LABELS[report.status] || report.status}
                    </span>
                  </div>
                  {report.affectedItems?.length > 0 && (
                    <p className="wh-handover-report-items">
                      {report.affectedItems
                        .map((item) => `${item.name} ×${item.quantity}`)
                        .join(', ')}
                    </p>
                  )}
                  {report.resolutionNote && (
                    <p className="wh-handover-report-answer">
                      {report.answeredBy ? `${report.answeredBy}: ` : ''}
                      {report.resolutionNote}
                    </p>
                  )}
                </article>
              ))}
              <p className="wh-handover-reports-note">
                Reporting never holds your package — it stays yours to collect.
              </p>
            </section>
          )}
        </>
      )}

      {screen === 'options' && (
        <section className="wh-card" aria-label="What went wrong">
          <p className="wh-field-label">What went wrong with this order?</p>
          <div className="wh-handover-options">
            {STUDENT_ISSUE_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="wh-handover-option"
                onClick={() => chooseIssue(value)}
              >
                <span>{label}</span>
                <Icon name="chevronRight" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}

      {screen === 'form' && (
        <form className="wh-card" onSubmit={sendReport}>
          <p className="wh-field-label">{optionLabel}</p>

          {issueNeedsItems(category) && (
            <>
              <p className="wh-handover-hint">
                Select the affected items and how many were affected.
              </p>
              <div className="wh-handover-items" role="group" aria-label="Affected items">
                {order.items.map((item) => {
                  const count = selection[item.productId] || 0;
                  return (
                    <div
                      key={item.productId}
                      className={`wh-handover-item${count > 0 ? ' selected' : ''}`}
                    >
                      <span className="wh-order-line-name">{item.name}</span>
                      <div className="wh-handover-stepper">
                        <button
                          type="button"
                          className="wh-icon-btn"
                          aria-label={`Fewer ${item.name}`}
                          disabled={count === 0 || sending}
                          onClick={() =>
                            setSelection((current) =>
                              setItemCount(current, item.productId, count - 1, item.quantity)
                            )
                          }
                        >
                          <Icon name="minus" size={18} />
                        </button>
                        <strong className="wh-num" aria-live="polite">
                          {count}
                          <small> of {item.quantity}</small>
                        </strong>
                        <button
                          type="button"
                          className="wh-icon-btn"
                          aria-label={`More ${item.name}`}
                          disabled={count >= item.quantity || sending}
                          onClick={() =>
                            setSelection((current) =>
                              setItemCount(current, item.productId, count + 1, item.quantity)
                            )
                          }
                        >
                          <Icon name="plus" size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <label className="wh-field-label" htmlFor="handover-note">
            What happened?
          </label>
          <textarea
            id="handover-note"
            className="wh-input wh-report-note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
            rows={4}
            placeholder="Tell the office in your own words."
            disabled={sending}
          />
          <p className="wh-report-count">
            {trimmedNote.length < NOTE_MIN_LENGTH
              ? `At least ${NOTE_MIN_LENGTH} characters`
              : `${note.length} of ${NOTE_MAX_LENGTH}`}
          </p>

          <button type="submit" className="wh-cta" disabled={Boolean(problem) || sending}>
            {sending ? 'Sending…' : 'Submit report'}
          </button>
        </form>
      )}

      {overlay?.type === 'collected' && (
        <HandoverResult
          variant="collected"
          mark="✓"
          kicker="All done"
          title="Order complete"
          body={`${firstName}, your package is yours — enjoy!`}
          onDone={closeOverlay}
          tapLabel="Tap anywhere to finish"
        />
      )}

      {overlay?.type === 'report' && (
        <HandoverResult
          variant="report"
          mark="✓"
          kicker="Sent to the office"
          title="Report submitted"
          body="The office will look into it and your caretaker will be told what was done."
          footnote={overlay.number ? `Report #${overlay.number}` : undefined}
          onDone={closeOverlay}
          tapLabel="Tap anywhere to go back"
        />
      )}
    </main>
  );
};

export default CollectOrder;
