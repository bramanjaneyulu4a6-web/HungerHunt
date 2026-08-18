import { Button } from './ui';

const RefreshButton = ({ onRefresh, loading = false }) => (
  <Button className="refresh-fab" onClick={onRefresh} disabled={loading}>
    {loading ? 'Refreshing…' : '🔄 Refresh'}
  </Button>
);

export default RefreshButton;
