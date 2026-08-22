import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';

/* What the hostels are telling the office.
 *
 * Two things arrive here: something wrong with one package, raised while it was
 * being handed to a student, and anything else a caretaker needs on the record
 * — including about the warehouse or about a colleague. That second kind is why
 * this screen exists in the admin console and in neither staff app. A channel
 * the subject of a complaint can read is not one anybody uses twice.
 *
 * Outstanding first by default, oldest first inside that. The failure mode of a
 * complaint channel is not losing a report, it is letting one sit unread until
 * the person who wrote it stops writing them. */

const VIEWS = [
  ['OUTSTANDING', 'Needs handling'],
  ['ORDER_ISSUE', 'Package issues'],
  ['COMPLAINT', 'Complaints'],
  ['ALL', 'Everything'],
];

const STATUS_VARIANT = {
  OPEN: 'alert',
  ACKNOWLEDGED: 'warn',
  RESOLVED: 'success',
};

const STATUS_LABEL = {
  OPEN: 'Unread',
  ACKNOWLEDGED: 'Being looked at',
  RESOLVED: 'Answered',
};

const queryFor = (view) => {
  if (view === 'OUTSTANDING') return '?status=OUTSTANDING';
  if (view === 'ALL') return '';
  return `?kind=${view}`;
};

const formatWhen = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export default function StaffReports() {
  const [view, setView] = useState('OUTSTANDING');
  const [reports, setReports] = useState([]);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [answer, setAnswer] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get(`/v1/reports${queryFor(view)}`);
      setReports(response.data.data || []);
      setOutstanding(response.data.meta?.outstanding || 0);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const handle = async (report, status, note = '') => {
    setWorkingId(report.id);
    try {
      await api.post(`/v1/reports/${report.id}/status`, { status, note });
      setResolving(null);
      setAnswer('');
      toast.success(status === 'RESOLVED' ? 'Answer sent to the caretaker' : 'Marked as being looked at');
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'That could not be saved');
      if (err.response?.status === 409) load();
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Caretaker reports"
        subtitle={
          outstanding > 0
            ? `${outstanding} report${outstanding === 1 ? '' : 's'} waiting on the office. Any admin can answer any of them, and the answer carries their name.`
            : 'Package issues and complaints raised from the hostels. Only this console can read them.'
        }
        actions={<Button variant="ghost" onClick={load}>Refresh</Button>}
      />

      <div className="warehouse-filterbar" role="tablist" aria-label="Report views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? 'active' : ''}
            onClick={() => setView(id)}
          >
            {label}
            {id === 'OUTSTANDING' && outstanding > 0 && <span>{outstanding}</span>}
          </button>
        ))}
      </div>

      {error && <Banner variant="alert">Could not load reports. Try refreshing.</Banner>}

      {loading ? (
        <Skeleton height={220} radius={16} />
      ) : reports.length === 0 && !error ? (
        <EmptyState
          icon="✓"
          variant={view === 'OUTSTANDING' ? 'success' : 'default'}
          title={view === 'OUTSTANDING' ? 'Nothing is waiting on the office' : 'No reports here yet'}
        >
          {view === 'OUTSTANDING'
            ? 'Every report from every hostel has been answered.'
            : 'Caretakers raise these from the packages screen and from the reports button in their app.'}
        </EmptyState>
      ) : (
        reports.map((report) => (
          <Card key={report.id} className="report-card">
            <div className="report-card__head">
              <div>
                <h2 className="report-card__title">{report.categoryLabel}</h2>
                <p className="report-card__meta">
                  {report.raisedBy?.name || 'Unknown caretaker'}
                  {report.raisedBy?.hostelNumber ? ` · Hostel ${report.raisedBy.hostelNumber}` : ''}
                  {' · '}
                  {formatWhen(report.raisedAt)}
                </p>
              </div>
              <div className="report-card__badges">
                <Badge variant={report.kind === 'ORDER_ISSUE' ? 'warn' : 'neutral'}>
                  {report.kind === 'ORDER_ISSUE' ? 'Package' : 'Complaint'}
                </Badge>
                <Badge variant={STATUS_VARIANT[report.status] || 'neutral'}>
                  {STATUS_LABEL[report.status] || report.status}
                </Badge>
              </div>
            </div>

            {report.order && (
              <p className="report-card__order">
                About the package for <strong>{report.order.studentName}</strong>
                {report.order.hostelNumber ? ` at hostel ${report.order.hostelNumber}` : ''} — it was{' '}
                {report.order.statusAtReport.replaceAll('_', ' ').toLowerCase()} when this was raised.
                The package was not held; the student could still collect it.
              </p>
            )}

            <p className="report-card__note">{report.note}</p>

            {/* Every admin sees this queue, so it matters that they can see who
                has already picked something up before they start typing. */}
            {report.status === 'ACKNOWLEDGED' && report.handling?.length > 0 && (
              <p className="report-card__meta report-card__handled">
                Picked up by {report.handling[report.handling.length - 1].actorName || 'the office'}
                {report.acknowledgedAt ? ` · ${formatWhen(report.acknowledgedAt)}` : ''}
              </p>
            )}

            {report.resolutionNote && (
              <div className="report-card__answer">
                <p className="report-card__answer-label">
                  Answered{report.answeredBy ? ` by ${report.answeredBy}` : ''}
                  {report.resolvedAt ? ` · ${formatWhen(report.resolvedAt)}` : ''}
                </p>
                <p>{report.resolutionNote}</p>
              </div>
            )}

            {report.status !== 'RESOLVED' && (
              resolving === report.id ? (
                <div className="report-card__resolve">
                  <label htmlFor={`answer-${report.id}`}>
                    What was done? The caretaker who raised this reads exactly these words,
                    with your name on them.
                  </label>
                  <textarea
                    id={`answer-${report.id}`}
                    className="input"
                    rows={3}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value.slice(0, 500))}
                    placeholder="Two juices were re-sent with the next round."
                  />
                  <div className="report-card__actions">
                    <Button
                      variant="ghost"
                      onClick={() => { setResolving(null); setAnswer(''); }}
                      disabled={workingId === report.id}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handle(report, 'RESOLVED', answer.trim())}
                      disabled={answer.trim().length === 0 || workingId === report.id}
                    >
                      {workingId === report.id ? 'Sending…' : 'Send answer and close'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="report-card__actions">
                  {report.status === 'OPEN' && (
                    <Button
                      variant="ghost"
                      onClick={() => handle(report, 'ACKNOWLEDGED')}
                      disabled={workingId === report.id}
                    >
                      Mark as being looked at
                    </Button>
                  )}
                  <Button onClick={() => { setResolving(report.id); setAnswer(''); }}>
                    Answer and close
                  </Button>
                </div>
              )
            )}
          </Card>
        ))
      )}
    </div>
  );
}
