import { useState } from 'react';
import toast from 'react-hot-toast';

import { Banner, Button, Card, PageHeader } from '../components/ui';
import api from '../utils/api';

const AccountingExport = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);

  const download = async (event) => {
    event.preventDefault();
    if (!from || !to) {
      toast.error('Select both dates');
      return;
    }

    setDownloading(true);
    try {
      const response = await api.get('/v1/accounting-exports/tally.xml', {
        params: { from, to },
        responseType: 'blob',
      });
      const disposition = response.headers['content-disposition'] || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'hungerhunt-tally.xml';
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${response.headers['x-hungerhunt-voucher-count'] || 0} vouchers exported`);
    } catch (error) {
      console.error(error);
      toast.error('Could not create the TallyPrime export. Check the date range and ledger data.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="TallyPrime Export"
        subtitle="Download balanced wallet and sales vouchers for bulk import into TallyPrime."
      />

      <Banner variant="warn" icon="⚠️">
        Before importing, create these ledgers in TallyPrime exactly: Student Wallet Liability,
        HungerHunt Sales, and Wallet Funding Clearing. Accounts must assign their groups and tax
        treatment. Import into a backup/test company first and review Tally's Exceptions Report.
      </Banner>

      <Card style={{ maxWidth: 620, marginTop: 20 }}>
        <h2 className="section-title">Export period</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
          The end date is inclusive. Exports are limited to 93 days and contain internal student
          references only—no names, phone numbers, passwords, or dorm details.
        </p>
        <form onSubmit={download} style={{ display: 'grid', gap: 16 }}>
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
          <Button type="submit" variant="success" disabled={downloading}>
            {downloading ? 'Preparing XML…' : 'Download TallyPrime XML'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default AccountingExport;

