import type { PaginationConfig } from "./types.js";

/** Create pagination context from config. Validates pageSize >= 1. */
export function createPaginationContext(config: PaginationConfig | undefined): {
  secret: string;
  pageSize: number;
  twoPhaseDiscovery: boolean;
  enabled: boolean;
} {
  if (!config) {
    return { secret: "", pageSize: 0, twoPhaseDiscovery: false, enabled: false };
  }
  if (!Number.isInteger(config.pageSize) || config.pageSize < 1) {
    throw new Error("pagination.pageSize must be a positive integer >= 1");
  }
  return {
    secret: crypto.randomUUID(),
    pageSize: config.pageSize,
    twoPhaseDiscovery: config.twoPhaseDiscovery ?? false,
    enabled: true,
  };
}
