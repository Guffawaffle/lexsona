/**
 * Idempotency Support for MCP Server
 *
 * Tracks request IDs to support safe retries.
 * Cached responses expire after TTL (5 minutes).
 *
 * @module
 */

interface CachedResponse {
  response: object;
  timestamp: string;
  expiresAt: number;
}

/**
 * Request ID cache for idempotency
 */
export class RequestCache {
  private cache = new Map<string, CachedResponse>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Check if a request ID has been seen before
   */
  has(requestId: string): boolean {
    const entry = this.cache.get(requestId);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(requestId);
      return false;
    }

    return true;
  }

  /**
   * Get cached response for a request ID
   */
  get(requestId: string): (object & { cached: true; originalRequestTime: string }) | null {
    const entry = this.cache.get(requestId);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(requestId);
      return null;
    }

    return {
      ...entry.response,
      cached: true,
      originalRequestTime: entry.timestamp,
    };
  }

  /**
   * Store a response for a request ID
   */
  set(requestId: string, response: object): void {
    const timestamp = new Date().toISOString();
    this.cache.set(requestId, {
      response,
      timestamp,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [requestId, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(requestId);
      }
    }
  }

  /**
   * Get cache size for testing/monitoring
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached requests (for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}
