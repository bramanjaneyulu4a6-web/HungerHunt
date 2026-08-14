const paths = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></>,
  logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
  wallet: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H19v16H5.5A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 7h16"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  arrowLeft: <><path d="m15 18-6-6 6-6"/></>,
  chevronRight: <><path d="m9 18 6-6-6-6"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8"/><path d="M6.6 6.6C3.6 8.3 2 12 2 12s3.5 6 10 6a10 10 0 0 0 3.4-.6"/></>,
  receipt: <><path d="M6 3h12v19l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  minus: <path d="M5 12h14"/>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7v13h12V7"/><path d="M10 11v6M14 11v6"/></>,
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 17v3h16v-3"/></>,
  trendDown: <><path d="m3 7 6 6 4-4 5 5"/><path d="M18 14h4v-4"/></>,
  // Points down for descending and is flipped in CSS for ascending, so one
  // glyph carries both directions and only the sorted column shows it.
  caret: <path d="m6 9 6 6 6-6"/>,
  /* The warehouse portal's three tabs. Each one is the thing itself — a taped
     box going out, the shelf it came off, the lorry bringing more — so the
     icon carries the screen even before the label underneath it is read. */
  package: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></>,
  shelf: <><path d="M3 4h18"/><path d="M3 12h18"/><path d="M3 20h18"/><path d="M6.5 4v8"/><path d="M13.5 12v8"/></>,
  truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/></>,
};

export default function Icon({ name, size = 20, className, ...rest }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
