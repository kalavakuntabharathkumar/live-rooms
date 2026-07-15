/**
 * Pipeline stats endpoint.
 * GET /api/pipeline-stats?window=<minutes>
 *
 * Returns rolling metrics computed by the MetricsAggregator over the
 * requested time window (default 5 minutes, max 60).
 */

import { Router, Request, Response } from 'express';
import { MetricsAggregator, eventProcessor } from '../pipeline/metricsAggregator';

const router = Router();
const aggregator = new MetricsAggregator(eventProcessor);

router.get('/', (_req: Request, res: Response) => {
  const rawWindow = Number(_req.query.window);
  const windowMinutes = Number.isFinite(rawWindow) && rawWindow > 0
    ? Math.min(Math.ceil(rawWindow), 60)
    : 5;

  const metrics = aggregator.compute(windowMinutes);
  res.json({ metrics });
});

export default router;
