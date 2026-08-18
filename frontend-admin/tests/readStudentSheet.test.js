import test from 'node:test';
import assert from 'node:assert/strict';

import { studentRecordsFromRows } from '../src/utils/readStudentSheet.js';

const headers = [
  'name',
  'admissionNumber',
  'fatherName',
  'hostelNumber',
  'grade',
  'parentPhoneNumber',
];

test('maps the first worksheet row to the backend student field names', () => {
  assert.deepEqual(
    studentRecordsFromRows([
      headers,
      ['Asha', 'A-10', 'Ravi', 'D-4', '8', '9876543210'],
      ['Neel', null, 'Ravi', 'D-4', '6', '9876543210'],
    ]),
    [
      {
        name: 'Asha',
        admissionNumber: 'A-10',
        fatherName: 'Ravi',
        hostelNumber: 'D-4',
        grade: '8',
        parentPhoneNumber: '9876543210',
      },
      {
        name: 'Neel',
        fatherName: 'Ravi',
        hostelNumber: 'D-4',
        grade: '6',
        parentPhoneNumber: '9876543210',
      },
    ]
  );
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
