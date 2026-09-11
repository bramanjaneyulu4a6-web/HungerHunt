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
    ['Asha', 'hh7a42', 'Ravi', 'D-4', '8', '9876543210'],
  ]);
  assert.equal(record.name, 'Asha');
  assert.equal(record.admissionNumber, 'HH7A42');
  assert.equal(record.__importRow, 2);
  assert.equal(record.__importCells.parentPhoneNumber, 'F2');
});

/* The sheet's heading is className now; a legacy grade column merely stands
   in for it. A sheet with neither is told the current name to add, not the
   old one. */
test('requires the core student columns', () => {
  assert.throws(
    () => studentRecordsFromRows([headers.filter((value) => value !== 'grade'), ['Asha']]),
    /Missing required columns: className/
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

test('accepts 4–8 alphanumeric admission numbers and rejects punctuation', () => {
  for (const admissionNumber of ['A123', '1234', 'AB12CD34']) {
    const [record] = studentRecordsFromRows([
      headers,
      ['Asha', admissionNumber, 'Ravi', 'D-4', '8', '9876543210'],
    ]);
    assert.equal(record.admissionNumber, admissionNumber);
  }

  assert.throws(
    () => studentRecordsFromRows([
      headers,
      ['Asha', 'AB-12', 'Ravi', 'D-4', '8', '9876543210'],
    ]),
    (error) => error.invalidCells.some((item) => item.column === 'admissionNumber')
  );
});
