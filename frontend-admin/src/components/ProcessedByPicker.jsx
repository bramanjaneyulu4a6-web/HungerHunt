/* "Processed by": who an export is narrowed to.
 *
 * Shared by the Transactions page's Export popup and the Exports page, so both
 * offer the same people in the same order under the same names. The list is
 * everyone who ever took a deposit or gave a refund (GET
 * /v1/accounting-exports/staff), plus one entry for the rows nobody on the
 * staff made — kiosk charges and parents' own payments.
 *
 * The list itself comes from useExportStaff (utils/exportStaff.js).
 *
 * The caller keeps the *unticked* keys rather than the ticked ones: the list
 * arrives after the popup opens, and "everyone" has to be the answer before
 * it does, not an empty selection.
 */
import { NO_STAFF, NO_STAFF_LABEL } from '../utils/transactionsExport';

const ProcessedByPicker = ({ staff, keys, loading, failed, unticked, onChange }) => {
  const toggle = (key) =>
    onChange(unticked.includes(key) ? unticked.filter((entry) => entry !== key) : [...unticked, key]);
  const options = [
    ...staff.map((person) => ({ key: person.id, label: person.name })),
    { key: NO_STAFF, label: NO_STAFF_LABEL },
  ];

  return (
    <fieldset className="export-types">
      <legend className="sr-only">Processed by</legend>
      {loading ? (
        <p className="export-picker__note">Loading staff…</p>
      ) : (
        <>
          {failed && (
            <p className="export-picker__note">Couldn&apos;t load the staff list — the export will include everyone.</p>
          )}
          {!failed && options.map((option) => (
            <label key={option.key} className="export-types__row">
              <input
                type="checkbox"
                checked={!unticked.includes(option.key)}
                onChange={() => toggle(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {!failed && (
            <div className="export-picker__bulk">
              <button type="button" className="link-button" onClick={() => onChange([])}>
                Select all
              </button>
              <button type="button" className="link-button" onClick={() => onChange(keys)}>
                Clear
              </button>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
};

export default ProcessedByPicker;
