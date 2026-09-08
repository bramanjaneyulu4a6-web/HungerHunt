/* The server names its downloads (Content-Disposition: attachment;
   filename="…"), and that name is the one that should land on disk — it
   carries the print timestamp. A missing or unreadable header falls back to
   the caller's stand-in rather than failing a download over a filename. */
export const filenameFromDisposition = (header, fallback) =>
  /filename="([^"]+)"/.exec(String(header || ""))?.[1] || fallback;
