/**
 * Pending-approval store — the safety backbone for every destructive-ish
 * action (sending context, applying edits).
 *
 * INVARIANT (unit-tested): nothing can be applied/consumed unless it was
 * explicitly approved by a user action carrying the exact pending id, and
 * every pending item expires. Unknown, rejected, expired, or already-used
 * ids return null — callers must treat null as "do not proceed".
 *
 * Pure module: no VS Code imports.
 */

export type ApprovalKind = "scan" | "scope" | "changes";

export interface PendingApproval<T> {
  id: string;
  kind: ApprovalKind;
  payload: T;
  createdAt: number;
  expiresAt: number;
}

export class ApprovalStore<T> {
  private items = new Map<string, PendingApproval<T>>();
  private seq = 0;

  constructor(private readonly defaultTtlMs = 10 * 60 * 1000) {}

  create(kind: ApprovalKind, payload: T, ttlMs = this.defaultTtlMs): PendingApproval<T> {
    this.sweep();
    const id = `ap-${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
    const now = Date.now();
    const item: PendingApproval<T> = { id, kind, payload, createdAt: now, expiresAt: now + ttlMs };
    this.items.set(id, item);
    return item;
  }

  /** Non-consuming read (for re-rendering previews). */
  get(id: string): PendingApproval<T> | null {
    const item = this.items.get(id);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.items.delete(id);
      return null;
    }
    return item;
  }

  /**
   * Consume an approval. Returns the payload exactly once; subsequent
   * approvals with the same id return null.
   */
  approve(id: string, expectedKind?: ApprovalKind): T | null {
    const item = this.items.get(id);
    if (!item) return null;
    if (expectedKind && item.kind !== expectedKind) return null;
    if (item.expiresAt <= Date.now()) {
      this.items.delete(id);
      return null;
    }
    this.items.delete(id); // consume
    return item.payload;
  }

  reject(id: string): boolean {
    return this.items.delete(id);
  }

  cancel(id: string): boolean {
    return this.reject(id);
  }

  sweep(now = Date.now()): void {
    for (const [id, item] of this.items) {
      if (item.expiresAt <= now) this.items.delete(id);
    }
  }

  get size(): number {
    this.sweep();
    return this.items.size;
  }
}
