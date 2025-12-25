/**
 * Tests for Idempotency Support
 *
 * Validates request ID caching and TTL behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RequestCache } from "../../../src/mcp/idempotency.js";

describe("RequestCache", () => {
  let cache: RequestCache;

  beforeEach(() => {
    cache = new RequestCache(5); // 5 second TTL for testing
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic operations", () => {
    it("stores and retrieves responses", () => {
      const response = { success: true, data: "test" };
      cache.set("req-1", response);

      const cached = cache.get("req-1");
      expect(cached).toBeDefined();
      expect(cached?.cached).toBe(true);
      expect(cached?.originalRequestTime).toBeDefined();
    });

    it("returns null for unknown request IDs", () => {
      const cached = cache.get("unknown");
      expect(cached).toBeNull();
    });

    it("has() returns true for cached requests", () => {
      cache.set("req-1", { success: true });
      expect(cache.has("req-1")).toBe(true);
    });

    it("has() returns false for unknown requests", () => {
      expect(cache.has("unknown")).toBe(false);
    });

    it("tracks cache size", () => {
      expect(cache.size()).toBe(0);
      cache.set("req-1", { success: true });
      expect(cache.size()).toBe(1);
      cache.set("req-2", { success: true });
      expect(cache.size()).toBe(2);
    });

    it("clears all entries", () => {
      cache.set("req-1", { success: true });
      cache.set("req-2", { success: true });
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe("TTL expiration", () => {
    it("expires entries after TTL", () => {
      cache.set("req-1", { success: true });
      expect(cache.has("req-1")).toBe(true);

      // Advance time past TTL (5 seconds + 1ms)
      vi.advanceTimersByTime(5001);

      expect(cache.has("req-1")).toBe(false);
      expect(cache.get("req-1")).toBeNull();
    });

    it("does not expire entries before TTL", () => {
      cache.set("req-1", { success: true });
      expect(cache.has("req-1")).toBe(true);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(4000);

      expect(cache.has("req-1")).toBe(true);
      expect(cache.get("req-1")).toBeDefined();
    });

    it("removes expired entries during cleanup", () => {
      cache.set("req-1", { success: true });
      cache.set("req-2", { success: true });
      expect(cache.size()).toBe(2);

      // Expire first entry
      vi.advanceTimersByTime(5001);

      cache.cleanup();
      expect(cache.size()).toBe(0);
    });

    it("keeps non-expired entries during cleanup", () => {
      cache.set("req-1", { success: true });

      // Wait 2 seconds
      vi.advanceTimersByTime(2000);

      cache.set("req-2", { success: true });

      // Wait another 3.5 seconds (total 5.5s, req-1 expired, req-2 at 3.5s)
      vi.advanceTimersByTime(3500);

      cache.cleanup();
      expect(cache.size()).toBe(1);
      expect(cache.has("req-2")).toBe(true);
    });
  });

  describe("cached response format", () => {
    it("includes cached flag in response", () => {
      const response = { success: true, message: "test" };
      cache.set("req-1", response);

      const cached = cache.get("req-1");
      expect(cached?.cached).toBe(true);
    });

    it("includes original request timestamp", () => {
      const beforeSet = new Date().toISOString();
      cache.set("req-1", { success: true });
      const afterSet = new Date().toISOString();

      const cached = cache.get("req-1");
      expect(cached?.originalRequestTime).toBeDefined();
      expect(cached!.originalRequestTime >= beforeSet).toBe(true);
      expect(cached!.originalRequestTime <= afterSet).toBe(true);
    });

    it("preserves original response data", () => {
      const response = {
        success: true,
        correction: "Always run tests",
        severity: "must",
      };
      cache.set("req-1", response);

      const cached = cache.get("req-1");
      expect(cached).toMatchObject({
        ...response,
        cached: true,
      });
    });
  });

  describe("edge cases", () => {
    it("handles updating same request ID", () => {
      cache.set("req-1", { success: true, version: 1 });
      cache.set("req-1", { success: true, version: 2 });

      const cached = cache.get("req-1");
      expect(cached).toBeDefined();
      expect((cached as { version: number }).version).toBe(2);
    });

    it("handles empty object response", () => {
      cache.set("req-1", {});
      const cached = cache.get("req-1");
      expect(cached?.cached).toBe(true);
    });

    it("handles complex nested response", () => {
      const response = {
        success: true,
        data: {
          nested: {
            deeply: {
              value: 42,
            },
          },
        },
        array: [1, 2, 3],
      };
      cache.set("req-1", response);

      const cached = cache.get("req-1");
      expect(cached).toMatchObject({
        ...response,
        cached: true,
      });
    });
  });

  describe("custom TTL", () => {
    it("supports custom TTL in constructor", () => {
      const shortCache = new RequestCache(1); // 1 second TTL
      shortCache.set("req-1", { success: true });

      expect(shortCache.has("req-1")).toBe(true);

      vi.advanceTimersByTime(1001);

      expect(shortCache.has("req-1")).toBe(false);
    });

    it("uses default TTL of 300 seconds", () => {
      const defaultCache = new RequestCache();
      defaultCache.set("req-1", { success: true });

      // Just before 300 seconds
      vi.advanceTimersByTime(299999);
      expect(defaultCache.has("req-1")).toBe(true);

      // After 300 seconds
      vi.advanceTimersByTime(2);
      expect(defaultCache.has("req-1")).toBe(false);
    });
  });
});
