const ALREADY_REPRESENTED_NOTE =
  'Backfilled receipt record; stock was already represented';

export const receiptAddedStock = (receipt) =>
  receipt?.stockApplied !== false &&
  !String(receipt?.note || '').startsWith(ALREADY_REPRESENTED_NOTE);

export const inventoryReceiptHistoryRows = (receipts, productId) =>
  receipts.flatMap((receipt) => {
    if (!receiptAddedStock(receipt)) return [];

    const received = (receipt.lines || [])
      .filter((line) => String(line.productId?._id ?? line.productId) === String(productId))
      .reduce((sum, line) => sum + (Number(line.received) || 0), 0);
    if (received <= 0) return [];

    const supplier = receipt.purchaseId?.supplierId?.name;
    const invoice = String(receipt.invoiceNumber || '').trim();
    return [{
      _id: `receipt-${receipt._id}-${productId}`,
      kind: 'RECEIPT',
      createdAt: receipt.createdAt,
      delta: received,
      reason: [
        supplier ? `Inventory order received from ${supplier}` : 'Inventory order received',
        invoice ? `invoice ${invoice}` : '',
      ].filter(Boolean).join(' · '),
      adjustedBy: receipt.receivedBy || null,
      stockAfter: null,
      purchaseId: receipt.purchaseId?._id ?? receipt.purchaseId,
    }];
  });
