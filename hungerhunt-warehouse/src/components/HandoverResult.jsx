import { useEffect } from 'react';

/* The kiosk's full-screen ending, restaged for the handover screen. The two
   moments this shows — a package leaving the shelf for good, a report on its
   way to the office — both deserve the same unmistakable "that worked" the
   till gives an order, because the person reading it is the same student. */
const HandoverResult = ({
  variant,
  mark,
  kicker,
  title,
  body,
  footnote,
  onDone,
  seconds = 5,
  tapLabel = 'Tap anywhere to continue',
}) => {
  useEffect(() => {
    const exit = window.setTimeout(onDone, seconds * 1000);
    return () => window.clearTimeout(exit);
  }, [onDone, seconds]);

  return (
    <div className={`wh-result wh-result--${variant}`} onClick={onDone} role="status">
      <div className="wh-result-burst" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} style={{ '--particle': index }} />
        ))}
      </div>
      <div className="wh-result-card">
        <div className={`wh-result-mark wh-result-mark--${variant}`} aria-hidden="true">
          {mark}
        </div>
        <p className="wh-result-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {footnote && <p className="wh-result-footnote">{footnote}</p>}
        <span className="wh-result-skip">{tapLabel}</span>
      </div>
      <div
        className="wh-result-timer"
        style={{ animationDuration: `${seconds}s` }}
        aria-hidden="true"
      />
    </div>
  );
};

export default HandoverResult;
