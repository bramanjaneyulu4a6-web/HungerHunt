import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import Student from '../models/Student.js';
import { creditWallet, debitWallet, readWallet, walletView } from '../utils/walletAccount.js';

afterEach(() => mock.restoreAll());

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.session = () => query;
  return query;
};

describe('the canonical wallet account', () => {
  test('returns one stable balance contract from Student.pocketMoney', async () => {
    const updatedAt = new Date('2026-08-14T09:00:00.000Z');
    mock.method(Student, 'findOne', () => queryFor({
      _id: 'student-1',
      pocketMoney: 425.5,
      updatedAt,
    }));

    assert.deepEqual(await readWallet('student-1'), {
      studentId: 'student-1',
      balance: 425.5,
      currency: 'INR',
      updatedAt,
    });
  });

  test('credits and debits mutate only the canonical projection atomically', async () => {
    const calls = [];
    mock.method(Student, 'findOneAndUpdate', async (...args) => {
      calls.push(args);
      return { _id: 'student-1', pocketMoney: calls.length === 1 ? 550 : 500 };
    });

    const credited = await creditWallet('student-1', 50, { activeOnly: true });
    const debited = await debitWallet('student-1', 50);

    assert.equal(walletView(credited).balance, 550);
    assert.equal(walletView(debited).balance, 500);
    assert.deepEqual(calls[0][1], { $inc: { pocketMoney: 50 } });
    assert.deepEqual(calls[1][0].pocketMoney, { $gte: 50 });
    assert.deepEqual(calls[1][1], { $inc: { pocketMoney: -50 } });
    assert.equal(calls[0][2].new, true);
    assert.equal(calls[1][2].new, true);
  });
});
