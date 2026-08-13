const write = (level, event, context = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
};

export const logger = Object.freeze({
  info: (event, context) => write('info', event, context),
  warn: (event, context) => write('warn', event, context),
  error: (event, context) => write('error', event, context),
});

