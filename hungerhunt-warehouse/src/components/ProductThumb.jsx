import { useState } from "react";

/* A picture of the thing, at the front of every row.
   The storeroom recognises stock by sight long before it reads a name, so the
   photo leads and the words follow. Products without an uploaded image — and
   images that 404 after a catalogue edit — fall back to the first letter on
   the same tile, never to a broken-image glyph or a collapsed row. */
const ProductThumb = ({ src, name, size = 56 }) => {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  if (!src || failed) {
    return (
      <span className="wh-thumb wh-thumb--letter" style={box} aria-hidden="true">
        {(name || "?").trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      className="wh-thumb"
      style={box}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

export default ProductThumb;
