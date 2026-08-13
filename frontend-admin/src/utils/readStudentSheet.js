const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_STUDENT_ROWS = 5_000;
const REQUIRED_COLUMNS = [
  'name',
  'fatherName',
  'hostelNumber',
  'grade',
  'parentPhoneNumber',
];

const hasValue = (value) => value !== null && value !== undefined && value !== '';

export const studentRecordsFromRows = (rows) => {
  if (rows.length < 2) {
    throw new Error('The first sheet needs a header row and at least one student.');
  }

  const headers = rows[0].map((value) => String(value ?? '').trim());
  const namedHeaders = headers.filter(Boolean);

  if (new Set(namedHeaders).size !== namedHeaders.length) {
    throw new Error('The first sheet contains duplicate column headings.');
  }

  const missing = REQUIRED_COLUMNS.filter((column) => !namedHeaders.includes(column));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}.`);
  }

  const dataRows = rows.slice(1).filter((row) => row.some(hasValue));
  if (!dataRows.length) {
    throw new Error('The workbook contains no student rows.');
  }
  if (dataRows.length > MAX_STUDENT_ROWS) {
    throw new Error(`Import at most ${MAX_STUDENT_ROWS.toLocaleString()} students at a time.`);
  }

  const unnamedDataColumn = headers.findIndex(
    (header, index) => !header && dataRows.some((row) => hasValue(row[index]))
  );
  if (unnamedDataColumn !== -1) {
    throw new Error(`Column ${unnamedDataColumn + 1} contains data but has no heading.`);
  }

  return dataRows.map((row) =>
    Object.fromEntries(
      headers.flatMap((header, index) =>
        header && hasValue(row[index]) ? [[header, row[index]]] : []
      )
    )
  );
};

export const readStudentSheet = async (file) => {
  if (!file?.name?.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Select an .xlsx workbook. Legacy .xls files are not supported.');
  }

  if (!file.size || file.size > MAX_FILE_BYTES) {
    throw new Error('The workbook must be non-empty and no larger than 5 MB.');
  }

  // Kept behind the submit action so the spreadsheet parser is not part of
  // the admin app's initial JavaScript bundle.
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  return studentRecordsFromRows(await readXlsxFile(file));
};
