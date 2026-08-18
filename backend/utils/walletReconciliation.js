const DEFAULT_TOLERANCE = 0.005;

const closeEnough = (left, right, tolerance) =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= tolerance;

const issue = (code, event, details = {}) => ({
  code,
  ...(event?._id ? { eventId: String(event._id) } : {}),
  ...(event?.kind ? { eventKind: event.kind } : {}),
  ...details,
});

/**
 * Reconstruct the wallet projection from chronologically ordered purchase and
 * top-up ledgers. The first event supplies the opening balance; every later
 * event must join the preceding event and the final value must equal Student.
 */
export const reconcileWallet = (student, events, tolerance = DEFAULT_TOLERANCE) => {
  const issues = [];
  let expectedBalance;

  for (const event of events) {
    const previousBalance = Number(event.previousBalance);
    const resultingBalance = Number(event.resultingBalance);
    const amount = Number(event.amount);

    if (![previousBalance, resultingBalance, amount].every(Number.isFinite)) {
      issues.push(issue('INVALID_LEDGER_VALUE', event));
      continue;
    }

    const calculatedBalance = ['TOP_UP', 'REFUND'].includes(event.kind)
      ? previousBalance + amount
      : previousBalance - amount;

    if (!closeEnough(calculatedBalance, resultingBalance, tolerance)) {
      issues.push(issue('INVALID_LEDGER_ARITHMETIC', event, {
        previousBalance,
        amount,
        recordedBalance: resultingBalance,
        calculatedBalance,
      }));
    }

    if (
      expectedBalance !== undefined &&
      !closeEnough(previousBalance, expectedBalance, tolerance)
    ) {
      issues.push(issue('LEDGER_GAP', event, {
        expectedPreviousBalance: expectedBalance,
        recordedPreviousBalance: previousBalance,
      }));
    }

    expectedBalance = resultingBalance;
  }

  const projectedBalance = Number(student.pocketMoney);
  if (!Number.isFinite(projectedBalance)) {
    issues.push(issue('INVALID_STUDENT_BALANCE'));
  } else if (expectedBalance === undefined) {
    if (!closeEnough(projectedBalance, 0, tolerance)) {
      issues.push(issue('NO_LEDGER_FOR_BALANCE', null, { projectedBalance }));
    }
  } else if (!closeEnough(projectedBalance, expectedBalance, tolerance)) {
    issues.push(issue('PROJECTION_MISMATCH', null, {
      ledgerBalance: expectedBalance,
      projectedBalance,
    }));
  }

  return {
    studentId: String(student._id),
    eventCount: events.length,
    issues,
  };
};
