/**
 * Aggregation layer for the real-time data pipeline.
 *
 * Reads from the EventProcessor queue and computes rolling metrics over a
 * configurable time window (default 5 minutes).
 */

import { EventProcessor } from './eventProcessor';

export interface PipelineMetrics {
  windowMinutes: number;
  computedAt: string; // ISO timestamp
  eventCount: number;
  messageCount: number;
  joinCount: number;
  leaveCount: number;
  disconnectCount: number;
  /** Average server-side message processing latency in ms (null when no messages). */
  avgLatencyMs: number | null;
  /**
   * Drop-off rate = (leave + disconnect) / join within the window.
   * Expressed as a value between 0 and 1 (null when no joins occurred).
   */
  dropOffRate: number | null;
  /** Messages processed per minute within the window. */
  messagesPerMinute: number;
  /** Total events stored in the pipeline queue (all time). */
  totalQueuedEvents: number;
}

export class MetricsAggregator {
  constructor(private readonly processor: EventProcessor) {}

  compute(windowMinutes = 5): PipelineMetrics {
    const windowMs = windowMinutes * 60 * 1000;
    const events = this.processor.getEventsInWindow(windowMs);

    let messageCount = 0;
    let joinCount = 0;
    let leaveCount = 0;
    let disconnectCount = 0;
    let totalLatencyMs = 0;
    let latencySamples = 0;

    for (const ev of events) {
      switch (ev.type) {
        case 'message':
          messageCount++;
          if (ev.latencyMs != null) {
            totalLatencyMs += ev.latencyMs;
            latencySamples++;
          }
          break;
        case 'join':
          joinCount++;
          break;
        case 'leave':
          leaveCount++;
          break;
        case 'disconnect':
          disconnectCount++;
          break;
      }
    }

    const avgLatencyMs =
      latencySamples > 0
        ? Math.round((totalLatencyMs / latencySamples) * 100) / 100
        : null;

    const dropOffRate =
      joinCount > 0
        ? Math.round(((leaveCount + disconnectCount) / joinCount) * 10000) / 10000
        : null;

    const messagesPerMinute =
      Math.round((messageCount / windowMinutes) * 100) / 100;

    return {
      windowMinutes,
      computedAt: new Date().toISOString(),
      eventCount: events.length,
      messageCount,
      joinCount,
      leaveCount,
      disconnectCount,
      avgLatencyMs,
      dropOffRate,
      messagesPerMinute,
      totalQueuedEvents: this.processor.size,
    };
  }
}

export { eventProcessor } from './eventProcessor';
