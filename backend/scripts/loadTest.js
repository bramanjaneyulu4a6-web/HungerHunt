const readOption = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const url = readOption('url');
const method = String(readOption('method', 'GET')).toUpperCase();
const concurrency = Number(readOption('concurrency', 10));
const requestCount = Number(readOption('requests', 100));
const timeoutMs = Number(readOption('timeout-ms', 10_000));
const expectedStatus = Number(readOption('expect-status', 200));
const maxErrorRate = Number(readOption('max-error-rate', 0));
const maxP95Ms = Number(readOption('max-p95-ms', Number.POSITIVE_INFINITY));
const token = process.env.LOAD_TEST_TOKEN?.trim();
const body = process.env.LOAD_TEST_BODY;

if (!url) throw new Error('--url is required.');
if (!['GET', 'HEAD'].includes(method) && !process.argv.includes('--allow-mutation')) {
  throw new Error('Non-read-only load tests require --allow-mutation. Use staging fixtures only.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) {
  throw new Error('--concurrency must be an integer from 1 to 500.');
}
if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > 1_000_000) {
  throw new Error('--requests must be an integer from 1 to 1000000.');
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
  throw new Error('--timeout-ms must be positive.');
}
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
  throw new Error('--max-error-rate must be between 0 and 1.');
}

const headers = { Accept: 'application/json' };
if (token) headers.Authorization = `Bearer ${token}`;
if (body !== undefined) headers['Content-Type'] = 'application/json';

const durations = [];
const statuses = new Map();
let nextRequest = 0;
let failures = 0;

const worker = async () => {
  while (true) {
    const requestNumber = nextRequest;
    nextRequest += 1;
    if (requestNumber >= requestCount) return;

    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
      if (response.status !== expectedStatus) failures += 1;
    } catch {
      statuses.set('network_error', (statuses.get('network_error') || 0) + 1);
      failures += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
};

const percentile = (sorted, value) => {
  const index = Math.max(0, Math.ceil((value / 100) * sorted.length) - 1);
  return sorted[index];
};

const startedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
const elapsedMs = performance.now() - startedAt;
const sortedDurations = durations.toSorted((left, right) => left - right);
const errorRate = failures / requestCount;
const report = {
  url,
  method,
  requests: requestCount,
  concurrency,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((requestCount / (elapsedMs / 1_000)).toFixed(2)),
  latencyMs: {
    p50: Number(percentile(sortedDurations, 50).toFixed(2)),
    p95: Number(percentile(sortedDurations, 95).toFixed(2)),
    p99: Number(percentile(sortedDurations, 99).toFixed(2)),
    max: Number(sortedDurations.at(-1).toFixed(2)),
  },
  statuses: Object.fromEntries(statuses),
  errorRate: Number(errorRate.toFixed(4)),
  thresholds: {
    maxErrorRate,
    maxP95Ms: Number.isFinite(maxP95Ms) ? maxP95Ms : null,
  },
};

console.log(JSON.stringify(report, null, 2));

if (errorRate > maxErrorRate || percentile(sortedDurations, 95) > maxP95Ms) {
  process.exitCode = 2;
}

