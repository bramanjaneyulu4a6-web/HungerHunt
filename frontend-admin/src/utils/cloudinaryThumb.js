/* Product images are stored as full Cloudinary secure_urls pointing at the
   original upload. Delivering the original to a 56-pixel tile wastes most of
   the bytes, so rendering inserts a transformation instead: f_auto/q_auto let
   Cloudinary's CDN pick WebP/AVIF and a sane quality, c_limit,w_ caps the
   width without ever upscaling. The stored URL is never rewritten — this is a
   read-side decoration only, and any URL this function does not positively
   recognise passes through untouched. */
const UPLOAD_MARKER = '/image/upload/';

export const cloudinaryThumb = (url, width = 144) => {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;

  const at = url.indexOf(UPLOAD_MARKER);
  if (at === -1) return url;

  const cut = at + UPLOAD_MARKER.length;
  if (url.slice(cut).startsWith('f_auto')) return url;

  return `${url.slice(0, cut)}f_auto,q_auto,c_limit,w_${width}/${url.slice(cut)}`;
};
