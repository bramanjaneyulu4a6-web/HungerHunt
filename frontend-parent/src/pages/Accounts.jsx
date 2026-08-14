import { useEffect, useState } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { formatINR } from '../utils/format';
import { AnimateIn, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import Icon from '../components/Icon';
import { ErrorFeedback } from '../components/error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';

const LOW_BALANCE = 500;

const AccountsSkeleton = () => (
  <div className="card-grid">
    {[0, 1].map((item) => (
      <Card key={item}><Skeleton width="48%" height={22} /><Skeleton width="70%" height={15} style={{ marginTop: 12 }} /><Skeleton height={48} style={{ marginTop: 28 }} /></Card>
    ))}
  </div>
);

export default function Accounts() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = () => {
    setError('');
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const response = await API.get('/parent/dashboard');
        if (ignore) return;
        setChildren(response.data.children || []);
        setError('');
      } catch (err) {
        if (ignore) return;
        setError(err.response?.data?.message || "Couldn't load your children's accounts.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [attempt]);

  return (
    <div className="page">
      <PageHeader title="Student accounts" subtitle="Balances, purchase history and spending controls for each linked student." />
      {loading && <AccountsSkeleton />}
      {!loading && error && <ErrorFeedback className="page-error-state" issue={presentError({ request: true, message: error })} action={{ label: 'Try again', onClick: retry }} />}
      {!loading && !error && children.length === 0 && <EmptyState icon="🎒" title="No students linked yet">Contact the school office to link a student to this parent account.</EmptyState>}
      {!loading && !error && children.length > 0 && (
        <div className="card-grid">
          {children.map((child, index) => {
            const balance = Number(child.pocketMoney || 0);
            return (
              <AnimateIn key={child._id} index={index}>
                <Card className="student-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="student-card-head">
                    <div className="student-identity">
                      <span className="student-avatar" aria-hidden="true">{child.name?.charAt(0).toUpperCase() || 'S'}</span>
                      <div><h2 className="card-title">{child.name}</h2><p className="student-meta">Grade {child.grade || '—'} · Room {child.hostelNumber || '—'}</p></div>
                    </div>
                    <Badge variant={balance > LOW_BALANCE ? 'success' : 'alert'}>{balance > LOW_BALANCE ? 'Available' : 'Low balance'}</Badge>
                  </div>
                  <div className="student-balance-row"><span className="student-balance-label">Wallet balance</span><strong className={`student-balance${balance <= LOW_BALANCE ? ' student-balance--low' : ''}`}>{formatINR(balance)}</strong></div>
                  <div className="student-card-actions">
                    <Button to={`/child/${child._id}`} variant="dark" block>View account <Icon name="chevronRight" size={17} /></Button>
                    <Button to={`/purchase-password/${child._id}`} variant="ghost" block><Icon name="shield" size={17} /> Purchase code</Button>
                  </div>
                </Card>
              </AnimateIn>
            );
          })}
        </div>
      )}
    </div>
  );
}
