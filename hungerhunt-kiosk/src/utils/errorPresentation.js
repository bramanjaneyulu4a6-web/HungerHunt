const readPayload = (error) => error?.response?.data || error || {};

const textOf = (error) => {
  const payload = readPayload(error);
  return String(payload.message || payload.error || error?.message || '').trim();
};

const includes = (text, pattern) => pattern.test(text.toLowerCase());

export const ERROR_PRESENTATIONS = Object.freeze({
  VALIDATION: 'validation',
  BLOCKED: 'blocked',
  EMPTY: 'empty',
  INSUFFICIENT_FUNDS: 'insufficientFunds',
  LIMIT_REACHED: 'limitReached',
  INSUFFICIENT_STOCK: 'insufficientStock',
  SECURITY: 'security',
  CODE_UPDATE: 'codeUpdate',
  LOCKED: 'locked',
  STALE_DATA: 'staleData',
  CONNECTION: 'connection',
  ACTION_FAILED: 'actionFailed',
});

export function presentError(error, fallback = {}) {
  const payload = readPayload(error);
  const rawMessage = textOf(error);
  const status = error?.response?.status ?? payload.status;
  const code = payload.code || error?.code || '';
  let presentation = fallback.presentation || ERROR_PRESENTATIONS.ACTION_FAILED;

  if (code === 'KIOSK_WALLET_EMPTY') presentation = ERROR_PRESENTATIONS.EMPTY;
  else if (code === 'KIOSK_ACTIVE_ORDER') presentation = ERROR_PRESENTATIONS.BLOCKED;
  else if (code === 'CODE_LOCKED' || status === 423) presentation = ERROR_PRESENTATIONS.LOCKED;
  else if (code === 'PRODUCT_LIMIT') presentation = ERROR_PRESENTATIONS.LIMIT_REACHED;
  else if (!error?.response && error && (error.request || includes(rawMessage, /network|connection|fetch/))) presentation = ERROR_PRESENTATIONS.CONNECTION;
  else if (status === 410 || includes(rawMessage, /expired|already been|changed while|refresh and try again|already processing/)) presentation = ERROR_PRESENTATIONS.STALE_DATA;
  else if (includes(rawMessage, /wallet|pocket money|available balance|balance!/)) presentation = ERROR_PRESENTATIONS.INSUFFICIENT_FUNDS;
  else if (includes(rawMessage, /limit.*reached|limit.*exceeded|limited to|awaiting parent approval/)) presentation = ERROR_PRESENTATIONS.LIMIT_REACHED;
  else if (includes(rawMessage, /stock|no longer sold|inventory record/)) presentation = ERROR_PRESENTATIONS.INSUFFICIENT_STOCK;
  else if (includes(rawMessage, /set before codes became 4 digits|needs updating/)) presentation = ERROR_PRESENTATIONS.CODE_UPDATE;
  else if (includes(rawMessage, /wrong purchase code|verification failed|incorrect.*code|current code incorrect|password incorrect/)) presentation = ERROR_PRESENTATIONS.SECURITY;
  else if (status === 409 || includes(rawMessage, /waiting for.*approval|order is still active|already has an order/)) presentation = ERROR_PRESENTATIONS.BLOCKED;
  else if (status === 404 || includes(rawMessage, /not found|no products|wallet is empty/)) presentation = ERROR_PRESENTATIONS.EMPTY;
  else if (status === 400 || includes(rawMessage, /required|must|do not match|greater than/)) presentation = ERROR_PRESENTATIONS.VALIDATION;

  const copy = {
    [ERROR_PRESENTATIONS.VALIDATION]: ['Check that entry', rawMessage || 'Please check the highlighted information.'],
    [ERROR_PRESENTATIONS.BLOCKED]: ['This order needs to wait', rawMessage || 'Another step must finish before you can continue.'],
    [ERROR_PRESENTATIONS.EMPTY]: ['Nothing here yet', rawMessage || 'There is nothing available here right now.'],
    [ERROR_PRESENTATIONS.INSUFFICIENT_FUNDS]: ['Not quite enough', rawMessage || 'The wallet does not have enough for this order.'],
    [ERROR_PRESENTATIONS.LIMIT_REACHED]: ['That limit is full', rawMessage || 'You have reached the allowed amount for this item.'],
    [ERROR_PRESENTATIONS.INSUFFICIENT_STOCK]: ['Only what’s left', rawMessage || 'There are fewer items available than requested.'],
    [ERROR_PRESENTATIONS.SECURITY]: ['That code didn’t match', rawMessage || 'Try the purchase code again.'],
    [ERROR_PRESENTATIONS.CODE_UPDATE]: ['Your purchase code needs updating', 'Ask your parent to create a new 4-digit purchase code in the Parent App.'],
    [ERROR_PRESENTATIONS.LOCKED]: ['Checkout temporarily locked', rawMessage || 'Too many incorrect purchase code attempts were made.'],
    [ERROR_PRESENTATIONS.STALE_DATA]: ['Something just changed', rawMessage || 'Review the latest information before trying again.'],
    [ERROR_PRESENTATIONS.CONNECTION]: ["Can’t reach HungerHunt", rawMessage || 'Check the connection and try again.'],
    [ERROR_PRESENTATIONS.ACTION_FAILED]: ['That didn’t go through', rawMessage || fallback.message || 'Please try again.'],
  }[presentation];

  return {
    presentation,
    title: fallback.title || copy[0],
    message: fallback.message || copy[1],
    rawMessage,
    code,
    status,
    stamp: presentation === ERROR_PRESENTATIONS.STALE_DATA
      ? (status === 410 || includes(rawMessage, /expired/) ? 'EXPIRED' : 'UPDATED')
      : undefined,
  };
}

