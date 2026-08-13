import crypto from 'node:crypto';
import { logger } from '../../../shared/observability/logger.js';

export const requestContext = (req, res, next) => {
  const requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  req.context = { requestId };
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info('http.request.completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      actorId: req.staff?.id,
      actorRole: req.staff?.role,
    });
  });

  next();
};

