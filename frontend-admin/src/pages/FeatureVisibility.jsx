import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { useCurrentStaff } from '../utils/currentStaff';
import { Badge, Banner, Button, Card, PageHeader, Skeleton } from '../components/ui';

/* The super admin's panel for what each staff app shows.
 *
 * One tab per role — admin console, warehouse app, caretaker app — and two
 * layers under each, both frontend hides rather than permissions: a default
 * per role (what every account of that role sees unless told otherwise) and
 * exceptions per account (show or hide one feature for one person). A super
 * admin is never affected by either and does not appear in the account list. */

const ROLE_TABS = [
  { role: 'admin', label: 'Admin console', noun: 'admin' },
  { role: 'warehouse', label: 'Warehouse app', noun: 'warehouse' },
  { role: 'caretaker', label: 'Caretaker app', noun: 'caretaker' },
];

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Follow role' },
  { value: 'shown', label: 'Show' },
  { value: 'hidden', label: 'Hide' },
];

const groupBy = (features) => {
  const groups = new Map();
  for (const feature of features) {
    if (!groups.has(feature.group)) groups.set(feature.group, []);
    groups.get(feature.group).push(feature);
  }
  return [...groups.entries()];
};

export default function FeatureVisibility() {
  const { me, loaded } = useCurrentStaff();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('admin');
  const [roleHidden, setRoleHidden] = useState(new Set());
  const [savingRole, setSavingRole] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [workingKey, setWorkingKey] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/admin/features');
      setData(response.data);
      setRoleHidden(new Set(response.data.roles[role].hidden));
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load feature settings.');
    }
  }, [role]);

  useEffect(() => {
    if (!loaded || !me.isSuperAdmin) return;
    const initial = window.setTimeout(load, 0);
    return () => window.clearTimeout(initial);
  }, [load, loaded, me.isSuperAdmin]);

  const features = useMemo(
    () => (data?.features || []).filter((feature) => feature.roles.includes(role)),
    [data, role],
  );
  const groups = useMemo(() => groupBy(features), [features]);
  const accounts = useMemo(
    () => (data?.accounts || []).filter((account) => account.role === role && !account.isSuperAdmin),
    [data, role],
  );
  const account = accounts.find((candidate) => candidate.id === accountId) || null;
  const tab = ROLE_TABS.find((candidate) => candidate.role === role);

  const roleDirty = data
    ? [...roleHidden].sort().join('|') !== [...data.roles[role].hidden].sort().join('|')
    : false;

  const switchRole = (next) => {
    setRole(next);
    setAccountId('');
    if (data) setRoleHidden(new Set(data.roles[next].hidden));
  };

  const toggleRole = (key) => {
    setRoleHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const saveRole = async () => {
    setSavingRole(true);
    try {
      await api.put(`/admin/features/roles/${role}`, { hidden: [...roleHidden] });
      toast.success(`${tab.label} defaults saved`);
      await load();
    } catch (saveError) {
      toast.error(saveError.response?.data?.message || 'Could not save the defaults');
    } finally {
      setSavingRole(false);
    }
  };

  const setOverride = async (key, value) => {
    if (!account) return;
    setWorkingKey(key);
    try {
      const response = await api.put(`/admin/features/accounts/${account.id}`, {
        overrides: { [key]: value || null },
      });
      setData((current) => ({
        ...current,
        accounts: current.accounts.map((row) => (row.id === account.id ? response.data.account : row)),
      }));
      toast.success(`Saved for ${account.name}`);
    } catch (saveError) {
      toast.error(saveError.response?.data?.message || 'Could not save the exception');
    } finally {
      setWorkingKey(null);
    }
  };

  // What the chosen account ends up seeing, mirrored from the server's rule.
  const effectiveFor = (feature) => {
    const override = account?.overrides?.[feature.key];
    if (override === 'hidden') return false;
    if (override === 'shown') return true;
    return !data.roles[role].hidden.includes(feature.key);
  };

  if (!loaded) return <div className="page"><Skeleton height={220} radius={14} /></div>;

  if (!me.isSuperAdmin) {
    return (
      <div className="page">
        <PageHeader title="Feature visibility" />
        <Banner variant="warn">Only a super admin can change which features the staff apps show.</Banner>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Feature visibility"
        subtitle="Choose what each kind of staff account sees in its app. Super admins always see everything. Hiding a feature removes it from the screen; it is not a permission."
      />

      <div className="feature-role-tabs" role="tablist" aria-label="Which app">
        {ROLE_TABS.map((candidate) => (
          <button
            key={candidate.role}
            type="button"
            role="tab"
            aria-selected={role === candidate.role}
            className={`feature-role-tab${role === candidate.role ? ' active' : ''}`}
            onClick={() => switchRole(candidate.role)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {error && <Banner variant="alert">{error}</Banner>}
      {!data && !error && <Skeleton height={220} radius={14} />}

      {data && (
        <>
          <Card className="feature-card">
            <div className="users-tab-head">
              <div>
                <h2>Defaults for {tab.noun} accounts</h2>
                <p>Tick a feature to show it to every {tab.noun} account. Individual exceptions below override this.</p>
              </div>
              <Button onClick={saveRole} disabled={!roleDirty || savingRole}>
                {savingRole ? 'Saving…' : 'Save defaults'}
              </Button>
            </div>
            <div className="feature-groups">
              {groups.map(([group, features]) => (
                <fieldset key={group} className="feature-group">
                  <legend>{group}</legend>
                  {features.map((feature) => (
                    <label key={feature.key} className="student-picker__row">
                      <input
                        type="checkbox"
                        checked={!roleHidden.has(feature.key)}
                        onChange={() => toggleRole(feature.key)}
                      />
                      <span>{feature.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </Card>

          <Card className="feature-card">
            <div className="users-tab-head">
              <div>
                <h2>Exceptions for one account</h2>
                <p>Show or hide a feature for a single {tab.noun} account, regardless of the defaults. Changes save as you make them.</p>
              </div>
            </div>
            <label className="feature-account-pick">
              <span className="field-label">{tab.label} account</span>
              <select className="input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Choose an account…</option>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>{row.name} — {row.email || row.phone}</option>
                ))}
              </select>
            </label>
            {!accounts.length && (
              <Banner variant="warn">
                {role === 'admin'
                  ? 'There are no plain admin accounts yet. Every admin is a super admin.'
                  : `There are no active ${tab.noun} accounts yet.`}
              </Banner>
            )}
            {account && (
              <div className="table-wrap">
                <table className="table table--stack">
                  <thead><tr><th>Feature</th><th>Group</th><th>Setting</th><th>Result</th></tr></thead>
                  <tbody>
                    {features.map((feature) => (
                      <tr key={feature.key}>
                        <td data-label="Feature">{feature.label}</td>
                        <td data-label="Group">{feature.group}</td>
                        <td data-label="Setting">
                          <select
                            className="input"
                            value={account.overrides?.[feature.key] || ''}
                            disabled={workingKey === feature.key}
                            onChange={(event) => setOverride(feature.key, event.target.value)}
                          >
                            {OVERRIDE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Result">
                          <Badge variant={effectiveFor(feature) ? 'success' : 'neutral'}>
                            {effectiveFor(feature) ? 'Visible' : 'Hidden'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
