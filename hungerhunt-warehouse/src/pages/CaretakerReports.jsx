import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Icon from '../components/Icon';
import ReportForm from '../components/ReportForm';
import RefreshButton from '../components/RefreshButton';
import { Banner, EmptyState, Skeleton } from '../components/ui';
import api from '../utils/api';
import {
  COMPLAINT_CATEGORIES,
  REPORT_STATUS_BADGE,
  REPORT_STATUS_LABELS,
} from '../utils/reports';

const PAGE_SIZE = 25;

/* Everything the caretaker has raised and what came back.
 *
 * The list is the point of the screen, not the form. A complaint channel that
 * only lets you post into it is a suggestion box, and people stop using those:
 * what makes this one worth typing into is that the answer lands here, in the
 * same place, under the thing it answers. */
const CaretakerReports = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get(`/v1/caretaker/reports?page=1&limit=${PAGE_SIZE}`);
      setReports(response.data.data || []);
      setOutstanding(response.data.meta?.outstanding || 0);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  return (
    <main className="wh-page">
      <div className="wh-row">
        <div>
          <button type="button" className="wh-back" onClick={() => navigate('/')}>
            <Icon name="caret" size={18} className="wh-back-icon" />
            Back to packages
          </button>
          <h1 className="wh-title">My reports</h1>
          <p className="wh-subtitle">
            {outstanding > 0
              ? `${outstanding} still with the office`
              : 'Anything you raise with the office appears here, with its answer'}
          </p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {composing ? (
        <section className="wh-card" aria-label="New report">
          <h2 className="wh-product">Raise something with the office</h2>
          <p className="wh-status-detail">
            This goes to the school office, and only to the school office. Nobody in the
            warehouse or at another hostel can read it.
          </p>
          <ReportForm
            kind="COMPLAINT"
            categories={COMPLAINT_CATEGORIES}
            submitLabel="Send to the office"
            onCancel={() => setComposing(false)}
            onFiled={async () => {
              setComposing(false);
              await load();
            }}
          />
        </section>
      ) : (
        <button type="button" className="wh-cta wh-report-open" onClick={() => setComposing(true)}>
          Raise something with the office
        </button>
      )}

      {loadError && <Banner variant="alert" icon="⚠️">Could not load your reports.</Banner>}

      {loading ? (
        <Skeleton height={200} radius={14} />
      ) : reports.length === 0 && !loadError ? (
        <EmptyState icon="receipt" title="You have not raised anything yet">
          Use the button above for anything that needs the office, or the “Issue with this
          package” button on a package you are handing over.
        </EmptyState>
      ) : (
        reports.map((report) => (
          <article key={report.id} className="wh-card wh-order">
            <div className="wh-row">
              <div>
                <span className="wh-who">{report.categoryLabel}</span>
                <p className="wh-remaining" style={{ margin: '4px 0 0' }}>
                  {report.kind === 'ORDER_ISSUE' && report.order
                    ? `Package for ${report.order.studentName}`
                    : 'Raised with the office'}
                  {' · '}
                  {new Date(report.raisedAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`wh-badge wh-badge--${REPORT_STATUS_BADGE[report.status] || 'new'}`}>
                {REPORT_STATUS_LABELS[report.status] || report.status}
              </span>
            </div>

            <p className="wh-report-said">{report.note}</p>

            {report.resolutionNote && (
              <div className="wh-report-answer">
                <p className="wh-field-label">
                  {report.answeredBy ? `${report.answeredBy} replied` : 'The office replied'}
                </p>
                <p>{report.resolutionNote}</p>
                {report.resolvedAt && (
                  <p className="wh-history-date">{new Date(report.resolvedAt).toLocaleString()}</p>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </main>
  );
};

export default CaretakerReports;
