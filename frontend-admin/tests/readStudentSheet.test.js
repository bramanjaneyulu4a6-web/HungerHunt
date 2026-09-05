import test from 'node:test';
import assert from 'node:assert/strict';

import { studentRecordsFromRows } from '../src/utils/readStudentSheet.js';

const headers = [
  'name',
  'admissionNumber',
  'fatherName',
  'roomNumber',
  'grade',
  'parentPhoneNumber',
];

test('maps the first worksheet row to the backend student field names', () => {
  const [record] = studentRecordsFromRows([
    headers,
    ['Asha', '10425', 'Ravi', 'D-4', '8', '9876543210'],
  ]);
  assert.equal(record.name, 'Asha');
  assert.equal(record.admissionNumber, '10425');
  assert.equal(record.__importRow, 2);
  assert.equal(record.__importCells.parentPhoneNumber, 'F2');
});

test('requires the core student columns', () => {
  assert.throws(
    () => studentRecordsFromRows([headers.filter((value) => value !== 'grade'), ['Asha']]),
    /Missing required columns: grade/
  );
});

test('rejects duplicate and unnamed populated columns', () => {
  assert.throws(
    () => studentRecordsFromRows([[...headers, 'name'], ['Asha']]),
    /duplicate column headings/
  );
  assert.throws(
    () => studentRecordsFromRows([[...headers, ''], ['Asha', 'A-10', 'Ravi', 'D-4', '8', '9', 'extra']]),
    /Column 7 contains data but has no heading/
  );
});

test('rejects empty and excessively large sheets', () => {
  assert.throws(() => studentRecordsFromRows([headers, []]), /contains no student rows/);
  assert.throws(
    () => studentRecordsFromRows([headers, ...Array.from({ length: 5_001 }, () => ['Asha'])]),
    /Import at most 5,000 students/
  );
});

test('reports every invalid student cell by spreadsheet coordinate', () => {
  assert.throws(
    () => studentRecordsFromRows([
      headers,
      ['', '12', 'Ravi', 'D-4', '', 'phone'],
    ]),
    (error) => {
      assert.equal(error.invalidCells.length, 4);
      assert.deepEqual(error.invalidCells.map((item) => item.cell), ['A2', 'B2', 'E2', 'F2']);
      return true;
    }
  );
});
