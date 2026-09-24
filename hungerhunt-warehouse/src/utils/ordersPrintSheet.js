import { Capacitor } from "@capacitor/core";
import { FileOpener } from "@capacitor-community/file-opener";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import api from "./api";
import { filenameFromDisposition } from "./contentDisposition";

/* The selected active stages as one consolidated receiving list per
   caretaker. The server owns grouping and rendering; this file only moves the
   PDF bytes to the platform's viewer or share sheet. */

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    // Past the "data:application/pdf;base64," prefix — Filesystem wants the
    // naked base64.
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });

// True when the share sheet was dismissed — a choice, not a failure.
export const isShareCancel = (error) => /cancel/i.test(String(error?.message || ""));

/* On the tablet the PDF lands in the app's cache and opens in the device's
   own viewer (share sheet if nothing can show a PDF); the OS may reclaim the
   cache, and a fresh copy is one tap away. On the web it opens in a new tab,
   which is where the print dialog lives.

   `sections` narrows the totals to the stages named (PENDING, PACKED,
   OUT_FOR_DELIVERY); the server includes every active stage when absent. */
export const openOrdersPrintSheet = async (sections) => {
  const response = await api.get("/v1/fulfillment-orders/print", {
    responseType: "blob",
    params: sections?.length ? { sections: sections.join(",") } : {},
  });
  const blob = response.data;
  const fileName = filenameFromDisposition(
    response.headers["content-disposition"],
    "orders-list.pdf"
  );

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await FileOpener.open({ filePath: uri, contentType: "application/pdf" });
    } catch {
      await Share.share({ title: fileName, url: uri });
    }
    return;
  }

  /* This runs after an await, outside the tap's own call stack, so a browser
     may treat the tab as a popup and refuse it (Safari answers null). No
     'noopener' in the features string — per spec that nulls the return even
     on success, which would make the fallback fire on every good open too;
     the opener reference is severed by hand instead. */
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  if (tab) {
    tab.opener = null;
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  // Long enough for the new tab to take the blob over; revoking immediately
  // races the load in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
