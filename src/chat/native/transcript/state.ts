/**
 * The transcript's own view state: which rows are open, and which open rows need their detail.
 *
 * Both are drawing state, the same two things desktop keeps on its view (`expanded` / `collapsed`
 * in `native_chat/state.rs`, `detail_demand` in `row_details.rs`). Row keys follow desktop's, so the
 * details the core ships (`rowDetails`, keyed by the screen's own row key) land on the right row.
 */

import { useCallback, useSyncExternalStore } from 'react';

import type { Json, ProjectedMessage, TranscriptItem } from '../../rust/document';
import type { UserAction } from '../../rust/actions';
import { animateNextFold } from './foldMotion';
import { arr, obj, str } from './json';

type AnswerCardSignature = {
  rowId: string;
  occurrence: number;
  pageId: string;
  by: string;
  summary: string;
  rowsJson: string;
  promptId: string | null;
  prefix: string;
};

type RetiredAnswerCard = {
  pageId: string;
  by: string;
  summary: string;
  rowsJson: string;
  expandedSuffixes: string[];
  collapsedSuffixes: string[];
};

function isPendingAnswersRowId(id: string): boolean {
  return (
    id.startsWith('pending:') ||
    id.startsWith('startup:') ||
    id.startsWith('form:') ||
    id.startsWith('launch-pending:')
  );
}

function answerCardPrefix(rowId: string, occurrence: number, pageId: string, by: string): string {
  return `answers-card:${rowId}:${occurrence}:${pageId}:${by}`;
}

function extractAnswerCards(items: readonly TranscriptItem[]): {
  cards: AnswerCardSignature[];
  rowIds: Set<string>;
} {
  const cards: AnswerCardSignature[] = [];
  const rowIds = new Set<string>();
  const visitMessage = (raw: ProjectedMessage | Json | undefined) => {
    const msg =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ProjectedMessage) : null;
    if (!msg || msg.role !== 'user') return;
    const primary = obj(msg.pageAnswers);
    if (!primary) return;
    const rowId = typeof msg.id === 'string' ? msg.id : '';
    if (!rowId) return;
    rowIds.add(rowId);
    const promptId =
      msg.startupDelivery?.promptId ??
      (rowId.startsWith('pending:startup:') ? rowId.slice('pending:startup:'.length) : null);
    const list = [primary, ...arr(msg.extraPageAnswers).map(obj).filter((c): c is NonNullable<typeof c> => c !== null)];
    for (let occurrence = 0; occurrence < list.length; occurrence += 1) {
      const card = list[occurrence]!;
      const pageId = str(card, 'pageId');
      const by = str(card, 'by');
      cards.push({
        rowId,
        occurrence,
        pageId,
        by,
        summary: str(card, 'summary'),
        rowsJson: JSON.stringify(card.rows ?? null),
        promptId: promptId && promptId.length > 0 ? promptId : null,
        prefix: answerCardPrefix(rowId, occurrence, pageId, by),
      });
    }
  };
  for (const item of items) {
    if (item.kind === 'message') visitMessage(item.message);
    else if (item.kind === 'summary') visitMessage(item.user);
  }
  return { cards, rowIds };
}

/**
 * Open rows. A row whose default comes from verbose mode records a close against that default
 * (`collapsed`), the way desktop's `toggle_marker_disclosure` does.
 */
export class DisclosureStore {
  private readonly expanded = new Set<string>();
  private readonly collapsed = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly anyListeners = new Set<() => void>();
  private lastAnswerItems: readonly TranscriptItem[] | null = null;
  private prevAnswerCards: AnswerCardSignature[] = [];
  private prevAnswerRowIds = new Set<string>();
  private readonly retiredAnswerCards: RetiredAnswerCard[] = [];
  private readonly recentRealAnswerRowIds: string[] = [];
  private readonly claimedAnswerCardPrefixes = new Set<string>();
  private readonly cancelledAnswerPromptIds = new Set<string>();
  private readonly pendingNotifyKeys = new Set<string>();

  /** Remember a prompt cancelled by `removeQueue` so its card disclosures never migrate elsewhere. */
  noteCancelledPrompt(promptId: string): void {
    if (promptId.length > 0) this.cancelledAnswerPromptIds.add(promptId);
  }

  /** Forget transient pending-settlement state when switching cores. */
  resetAnswerMigration(): void {
    this.lastAnswerItems = null;
    this.prevAnswerCards = [];
    this.prevAnswerRowIds.clear();
    this.retiredAnswerCards.length = 0;
    this.recentRealAnswerRowIds.length = 0;
    this.claimedAnswerCardPrefixes.clear();
    this.cancelledAnswerPromptIds.clear();
    this.pendingNotifyKeys.clear();
  }

  private hasPendingAnswerDisclosure(): boolean {
    const isPendingKey = (key: string) => {
      if (!key.startsWith('answers-card:')) return false;
      const first = key.slice('answers-card:'.length).split(':', 1)[0] ?? '';
      return first === 'pending' || first === 'startup' || first === 'form' || first === 'launch-pending';
    };
    for (const key of this.expanded) if (isPendingKey(key)) return true;
    for (const key of this.collapsed) if (isPendingKey(key)) return true;
    return false;
  }

  private hasPrefixDisclosure(prefix: string): boolean {
    const sub = `${prefix}:`;
    for (const key of this.expanded) if (key === prefix || key.startsWith(sub)) return true;
    for (const key of this.collapsed) if (key === prefix || key.startsWith(sub)) return true;
    return false;
  }

  private drainSuffixes(set: Set<string>, prefix: string): string[] {
    const sub = `${prefix}:`;
    const matched: string[] = [];
    for (const key of set) {
      if (key === prefix || key.startsWith(sub)) matched.push(key);
    }
    const suffixes: string[] = [];
    for (const key of matched) {
      set.delete(key);
      suffixes.push(key.slice(prefix.length));
    }
    return suffixes;
  }

  private migrateRetiredCard(card: AnswerCardSignature): void {
    if (this.claimedAnswerCardPrefixes.has(card.prefix)) return;
    const pos = this.retiredAnswerCards.findIndex(
      (retired) =>
        retired.pageId === card.pageId &&
        retired.by === card.by &&
        retired.summary === card.summary &&
        retired.rowsJson === card.rowsJson,
    );
    if (pos < 0) return;
    const [retired] = this.retiredAnswerCards.splice(pos, 1);
    if (!retired) return;
    this.claimedAnswerCardPrefixes.add(card.prefix);
    for (const suffix of retired.expandedSuffixes) {
      const nextKey = `${card.prefix}${suffix}`;
      this.expanded.add(nextKey);
      this.pendingNotifyKeys.add(nextKey);
    }
    for (const suffix of retired.collapsedSuffixes) {
      const nextKey = `${card.prefix}${suffix}`;
      this.collapsed.add(nextKey);
      this.pendingNotifyKeys.add(nextKey);
    }
  }

  /**
   * Migrates per-card `answers-card:<rowId>:<occ>:<pageId>:<by>` disclosure state across pending
   * to settled transcript transitions (including combined multi-answer turns) while ignoring
   * cancelled (`removeQueue`) cards and pre-existing history.
   */
  reconcilePageAnswers(items: readonly TranscriptItem[] | null | undefined): void {
    if (!items || items === this.lastAnswerItems) return;
    const isInitial = this.lastAnswerItems === null;
    this.lastAnswerItems = items;
    const { cards: currentCards, rowIds: currentRowIds } = extractAnswerCards(items);
    if (isInitial) {
      this.prevAnswerCards = currentCards;
      this.prevAnswerRowIds = currentRowIds;
      return;
    }

    const active =
      this.expanded.size > 0 ||
      this.collapsed.size > 0 ||
      this.retiredAnswerCards.length > 0 ||
      this.cancelledAnswerPromptIds.size > 0;
    if (!active) {
      this.recentRealAnswerRowIds.length = 0;
      this.claimedAnswerCardPrefixes.clear();
      this.prevAnswerCards = currentCards;
      this.prevAnswerRowIds = currentRowIds;
      return;
    }

    const insertedCards = currentCards.filter((card) => !this.prevAnswerRowIds.has(card.rowId));
    const removedPromptIds = new Set<string>();
    const hasAnyDisclosure =
      this.expanded.size > 0 || this.collapsed.size > 0 || this.retiredAnswerCards.length > 0;
    for (const prevCard of this.prevAnswerCards) {
      if (!isPendingAnswersRowId(prevCard.rowId) || currentRowIds.has(prevCard.rowId)) continue;
      if (prevCard.promptId && this.cancelledAnswerPromptIds.has(prevCard.promptId)) {
        this.drainSuffixes(this.expanded, prevCard.prefix);
        this.drainSuffixes(this.collapsed, prevCard.prefix);
        removedPromptIds.add(prevCard.promptId);
        continue;
      }
      const expandedSuffixes = this.drainSuffixes(this.expanded, prevCard.prefix);
      const collapsedSuffixes = this.drainSuffixes(this.collapsed, prevCard.prefix);
      if (hasAnyDisclosure || expandedSuffixes.length > 0 || collapsedSuffixes.length > 0) {
        // Keep untouched retired pending cards alongside opened siblings so merged rows preserve
        // per-occurrence disclosure placement across identical cards.
        this.retiredAnswerCards.push({
          pageId: prevCard.pageId,
          by: prevCard.by,
          summary: prevCard.summary,
          rowsJson: prevCard.rowsJson,
          expandedSuffixes,
          collapsedSuffixes,
        });
        while (this.retiredAnswerCards.length > 16) this.retiredAnswerCards.shift();
      }
    }
    for (const promptId of removedPromptIds) {
      if (!currentCards.some((card) => card.promptId === promptId)) {
        this.cancelledAnswerPromptIds.delete(promptId);
      }
    }

    const hasPendingDisclosure = this.hasPendingAnswerDisclosure();
    if (hasPendingDisclosure || this.retiredAnswerCards.length > 0) {
      for (const card of insertedCards) {
        if (!isPendingAnswersRowId(card.rowId) && !this.recentRealAnswerRowIds.includes(card.rowId)) {
          this.recentRealAnswerRowIds.push(card.rowId);
          while (this.recentRealAnswerRowIds.length > 16) this.recentRealAnswerRowIds.shift();
        }
      }
    } else {
      this.recentRealAnswerRowIds.length = 0;
      this.claimedAnswerCardPrefixes.clear();
    }

    if (this.retiredAnswerCards.length > 0) {
      for (const card of insertedCards) {
        if (!isPendingAnswersRowId(card.rowId)) {
          this.migrateRetiredCard(card);
          if (this.retiredAnswerCards.length === 0) break;
        }
      }
      if (this.retiredAnswerCards.length > 0 && this.recentRealAnswerRowIds.length > 0) {
        const recentSet = new Set(this.recentRealAnswerRowIds);
        const cardsByRow = new Map<string, AnswerCardSignature[]>();
        const rowOrderNewestFirst: string[] = [];
        for (let i = currentCards.length - 1; i >= 0; i -= 1) {
          const rowId = currentCards[i]!.rowId;
          if (!cardsByRow.has(rowId) && !isPendingAnswersRowId(rowId) && this.prevAnswerRowIds.has(rowId) && recentSet.has(rowId)) {
            rowOrderNewestFirst.push(rowId);
            cardsByRow.set(rowId, []);
          }
        }
        for (const card of currentCards) {
          const bucket = cardsByRow.get(card.rowId);
          if (bucket) bucket.push(card);
        }
        for (const rowId of rowOrderNewestFirst) {
          const rowCards = cardsByRow.get(rowId);
          if (!rowCards) continue;
          for (const card of rowCards) {
            if (this.claimedAnswerCardPrefixes.has(card.prefix) || this.hasPrefixDisclosure(card.prefix)) continue;
            this.migrateRetiredCard(card);
            if (this.retiredAnswerCards.length === 0) break;
          }
          if (this.retiredAnswerCards.length === 0) break;
        }
      }
    }
    if (!this.hasPendingAnswerDisclosure()) {
      if (
        this.retiredAnswerCards.every(
          (card) => card.expandedSuffixes.length === 0 && card.collapsedSuffixes.length === 0,
        )
      ) {
        this.retiredAnswerCards.length = 0;
      }
      if (this.retiredAnswerCards.length === 0) {
        this.recentRealAnswerRowIds.length = 0;
        this.claimedAnswerCardPrefixes.clear();
      }
    }
    this.prevAnswerCards = currentCards;
    this.prevAnswerRowIds = currentRowIds;
  }

  /** Notify listeners subscribed to migrated keys after commit so memoized rows update. */
  flushAnswerMigrationNotifications(): void {
    if (this.pendingNotifyKeys.size === 0) return;
    const keys = [...this.pendingNotifyKeys];
    this.pendingNotifyKeys.clear();
    for (const key of keys) {
      this.listeners.get(key)?.forEach((listener) => listener());
    }
  }

  isOpen(key: string, openByDefault: boolean): boolean {
    return this.expanded.has(key) || (openByDefault && !this.collapsed.has(key));
  }

  /** Flip a row; `open` is what the row showed when it was pressed. The change eases (`foldMotion.ts`). */
  toggle(key: string, open: boolean): void {
    animateNextFold();
    if (open) {
      this.expanded.delete(key);
      this.collapsed.add(key);
    } else {
      this.collapsed.delete(key);
      this.expanded.add(key);
    }
    this.listeners.get(key)?.forEach((listener) => listener());
    this.anyListeners.forEach((listener) => listener());
  }

  /** Every opened and closed key, sorted, for the find's `searchFolds` report. */
  folds(): { expanded: string[]; collapsed: string[] } {
    return { expanded: [...this.expanded].sort(), collapsed: [...this.collapsed].sort() };
  }

  /** Called after any row flips. */
  subscribeAll(listener: () => void): () => void {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }

  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(key);
    };
  }
}

/** `[open, toggle]` for one row. */
export function useDisclosure(store: DisclosureStore, key: string, openByDefault = false): [boolean, () => void] {
  const subscribe = useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]);
  const open = useSyncExternalStore(subscribe, () => store.isOpen(key, openByDefault));
  const toggle = useCallback(() => store.toggle(key, store.isOpen(key, openByDefault)), [store, key, openByDefault]);
  return [open, toggle];
}

/** One open row that wants its detail (`OpenRowDetail` in the core's `event.rs`). */
export type OpenRow = { key: string; kind: 'tool' | 'file'; messageId: string; index: number };

/**
 * The rows currently drawn open. Rows register while they are mounted open and the set is sent as
 * one `rowDetails` action after the burst of mounts settles, only when it changed (desktop's
 * `schedule_row_detail_sync`). A row the list recycles off screen drops out, and asks again when it
 * comes back.
 */
export class RowDetailDemand {
  private readonly rows = new Map<string, { row: OpenRow; count: number }>();
  /** Nothing is open until a row says so, and the core starts with nothing open. */
  private sent = '[]';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private dispatch: (action: UserAction) => void) {}

  setDispatch(dispatch: (action: UserAction) => void): void {
    this.dispatch = dispatch;
  }

  add(row: OpenRow): () => void {
    const entry = this.rows.get(row.key);
    if (entry !== undefined) entry.count += 1;
    else this.rows.set(row.key, { row, count: 1 });
    this.schedule();
    return () => {
      const current = this.rows.get(row.key);
      if (current === undefined) return;
      current.count -= 1;
      if (current.count <= 0) this.rows.delete(row.key);
      this.schedule();
    };
  }

  /** Forget what was sent, so the next change re-sends the whole set (a new core). */
  reset(): void {
    this.sent = this.rows.size === 0 ? '[]' : '';
    this.schedule();
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const open = [...this.rows.values()].map((entry) => entry.row).sort((a, b) => (a.key < b.key ? -1 : 1));
      const signature = JSON.stringify(open);
      if (signature === this.sent) return;
      this.sent = signature;
      this.dispatch({ type: 'rowDetails', open });
    }, 16);
  }
}
