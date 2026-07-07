/**
 * Event-processing module for the real-time data pipeline.
 *
 * Consumes Socket.io events (join, leave, message, disconnect) and pushes
 * them into a bounded in-memory queue that the aggregation layer reads from.
 */

export type PipelineEventType = 'join' | 'leave' | 'message' | 'disconnect';

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: number; // Unix ms
  roomId?: string;
  userId?: string;
  /** Round-trip processing latency in ms (message events only). */
  latencyMs?: number;
}

const MAX_QUEUE_SIZE = 10_000;

export class EventProcessor {
  private queue: PipelineEvent[] = [];

  /**
   * Push a new event into the pipeline queue.
   * When the queue reaches MAX_QUEUE_SIZE the oldest entry is evicted.
   */
  push(event: PipelineEvent): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
    }
    this.queue.push(event);
  }

  /**
   * Return all events whose timestamp falls within the last `windowMs`
   * milliseconds, without mutating the queue.
   */
  getEventsInWindow(windowMs: number): PipelineEvent[] {
    const cutoff = Date.now() - windowMs;
    // Queue is time-ordered; binary-search for the first event ≥ cutoff
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.queue[mid].timestamp < cutoff) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return this.queue.slice(lo);
  }

  /** Total events currently held in the queue. */
  get size(): number {
    return this.queue.length;
  }
}

/** Singleton shared across the socket layer and route layer. */
export const eventProcessor = new EventProcessor();
