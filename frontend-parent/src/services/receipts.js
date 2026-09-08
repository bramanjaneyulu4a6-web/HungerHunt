import { Capacitor } from '@capacitor/core';
import { FileOpener } from '@capacitor-community/file-opener';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import API from './api';

/* Wallet recharge receipts. The server owns everything the receipt says —
   number, letterhead, wording — so viewing and re-downloading are both plain
   reads and can be repeated forever. */

export const fetchReceipt = async (adjustmentId) => {
  const { data } = await API.get(`/parent/receipts/${adjustmentId}`);
  return data.receipt;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    // Past the "data:application/pdf;base64," prefix — Filesystem wants
    // the naked base64.
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });

// True when the parent dismissed the share sheet — a choice, not a failure.
export const isShareCancel = (error) =>
  /cancel/i.test(String(error?.message || ''));

/* Fetches the PDF and, on a phone, lands it in the app's cache — the one
   place both opening and sharing can start from. Cache, not Documents: the
   OS may reclaim it, and a fresh copy is one tap away. */
const fetchPdf = async (adjustmentId, receiptNumber) => {
  const { data: blob } = await API.get(`/parent/receipts/${adjustmentId}/pdf`, {
    responseType: 'blob',
  });
  const fileName = `${receiptNumber || 'receipt'}.pdf`;

  if (!Capacitor.isNativePlatform()) return { blob, fileName, uri: null };

  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  return { blob, fileName, uri };
};

export const saveReceiptPdf = async (adjustmentId, receiptNumber) => {
  const { blob, fileName, uri } = await fetchPdf(adjustmentId, receiptNumber);

  if (uri) {
    // The webview cannot hand a browser download to the OS, so the file goes
    // through the share sheet — WhatsApp, Files, print, whatever is picked.
    await Share.share({ title: fileName, url: uri });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/* Opens the receipt right on the device: the phone's own PDF viewer on
   Android/iOS, a new tab on the web. A phone with no app able to show a PDF
   answers with the share sheet instead, so the tap always leads somewhere. */
export const openReceiptPdf = async (adjustmentId, receiptNumber) => {
  const { blob, fileName, uri } = await fetchPdf(adjustmentId, receiptNumber);

  if (uri) {
    try {
      await FileOpener.open({ filePath: uri, contentType: 'application/pdf' });
    } catch {
      await Share.share({ title: fileName, url: uri });
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Long enough for the new tab to take the blob over; revoking immediately
  // races the load in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
