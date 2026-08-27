const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_STUDENT_ROWS = 5_000;
const REQUIRED_COLUMNS = [
  'name',
  'admissionNumber',
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

  const unexpected = namedHeaders.filter((column) => !REQUIRED_COLUMNS.includes(column));
  if (unexpected.length) {
    throw new Error(`Unexpected columns: ${unexpected.join(', ')}. Use only the six documented headings.`);
  }

  const dataRows = rows.slice(1).filter((row) => row.some(hasValue));
  if (!dataRows.length) {
    throw new Error('The workbook contains no student rows.');
  }
  if (dataRows.length > MAX_STUDENT_ROWS) {
    throw new Error(`Import at most ${MAX_STUDENT_ROWS.toLocaleString()} students at a time.`);
  }

  const widestRow = Math.max(headers.length, ...dataRows.map((row) => row.length));
  const unnamedDataColumn = Array.from({ length: widestRow }, (_, index) => index).find(
    (index) => !headers[index] && dataRows.some((row) => hasValue(row[index]))
  );
  if (unnamedDataColumn !== undefined) {
    throw new Error(`Column ${unnamedDataColumn + 1} contains data but has no heading.`);
  }

  const excelColumn = (index) => {
    let value = index + 1;
    let label = '';
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  };

  const invalidCells = [];
  const records = dataRows.map((row) => {
    const sheetRow = rows.indexOf(row, 1) + 1;
    const record = Object.fromEntries(
      headers.flatMap((header, index) =>
        header && hasValue(row[index]) ? [[header, String(row[index]).trim()]] : []
      )
    );
    record.__importRow = sheetRow;
    record.__importCells = Object.fromEntries(
      headers.filter(Boolean).map((header) => {
        const column = headers.indexOf(header);
        return [header, `${excelColumn(column)}${sheetRow}`];
      })
    );

    const check = (field, valid, message) => {
      if (!valid) invalidCells.push({
        row: sheetRow,
        column: field,
        cell: record.__importCells[field],
        message,
      });
    };
    check('name', Boolean(record.name), 'Student name is required.');
    check('admissionNumber', /^\d{5}$/.test(record.admissionNumber || ''), 'Admission number must be exactly 5 digits.');
    check('fatherName', Boolean(record.fatherName), "Father's name is required.");
    check('hostelNumber', Boolean(record.hostelNumber), 'Hostel code is required.');
    check('grade', Boolean(record.grade), 'Grade / class is required.');
    check('parentPhoneNumber', /^\d{10}$/.test(record.parentPhoneNumber || ''), 'Parent phone number must be exactly 10 digits.');
    return record;
  });

  if (invalidCells.length) {
    const error = new Error('Invalid student sheet. Correct the listed cells and import it again.');
    error.invalidCells = invalidCells;
    throw error;
  }

  return records;
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
