import api from './api';

const filenameFromDisposition = (value) => {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return value?.match(/filename="?([^";]+)"?/i)?.[1] || 'active-orders-by-caretaker.pdf';
};

/* Fetch the server-rendered snapshot and open it where the browser can print
 * it. If popups are blocked, downloading the same PDF is the safe fallback. */
export const openActiveOrdersExport = async () => {
  const response = await api.get('/v1/fulfillment-orders/admin-export', {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const tab = window.open(url, '_blank');

  if (tab) {
    tab.opener = null;
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = filenameFromDisposition(response.headers['content-disposition']);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export default openActiveOrdersExport;
