/* Product tiles need one predictable image canvas. Cloudinary fits the entire
   product onto the kiosk's warm image background, so tall bottles and wide
   packets keep all of their edges while every response has the same dimensions
   before CSS paints it into the card. Stored URLs are never modified. */
const UPLOAD_MARKER = '/image/upload/';
const VERSION_MARKER = /v\d+\//;

export const cloudinaryTile = (url, width = 640, height = 480) => {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;

  const at = url.indexOf(UPLOAD_MARKER);
  if (at === -1) return url;

  const cut = at + UPLOAD_MARKER.length;
  const remainder = url.slice(cut);
  const versionAt = remainder.search(VERSION_MARKER);
  const assetPath = versionAt === -1 ? remainder : remainder.slice(versionAt);
  const transform = `f_auto,q_auto,c_pad,b_rgb:f1eae0,w_${width},h_${height}`;

  return `${url.slice(0, cut)}${transform}/${assetPath}`;
};
