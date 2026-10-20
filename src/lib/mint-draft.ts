"use client";

/// ───────────────────────────── Mint draft storage ──────────────────────────
///
/// Keeps the mint wizard's work across a page reload.
///
/// **Why this exists.** Connecting a wallet on mobile hands off to another app
/// and comes back to a reloaded page. Without a draft that costs the visitor the
/// photo they chose, the artwork they paid to generate, and every field they
/// filled — at the exact moment they are most invested. It is the worst drop-off
/// in the funnel.
///
/// **Why IndexedDB and not `localStorage`.** The photo is up to 8 MB and
/// `localStorage` holds ~5 MB of UTF-16 *and cannot store a `Blob`*. Base64 would
/// inflate it by a third and blow the quota, so the store would silently fail
/// precisely on the large photos that most need saving. IndexedDB keeps the
/// `File` as-is.
///
/// **What is not stored.** `photoPreview` is a `URL.createObjectURL` handle and
/// is dead after a reload; it is rebuilt from the stored `File` on restore. The
/// transient flags (`isGenerating`, `isMinting`, `error`) are deliberately not
/// persisted — restoring a spinner that is not running would be a lie.

const DB_NAME = "airen-mint";
const STORE = "draft";
const KEY = "current";
const DB_VERSION = 1;

/// A draft older than this is almost certainly abandoned. Restoring it would put
/// a stale photo in front of someone who has long moved on.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MintDraft = {
  /// The original photo. `Blob` covers both `File` and the object returned by
  /// IndexedDB after a round trip.
  photo: Blob | null;
  generated: { dataUrl: string; mimeType: string } | null;
  /// Whatever the grader assigned. Opaque here on purpose — this module should
  /// not have to know the grade shape to persist it.
  grade: unknown | null;
  name: string;
  description: string;
  step: number;
  savedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the draft store."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Draft operation failed."));
    });
  } finally {
    db.close();
  }
}

/// Reads the stored draft, discarding one that is too old to be useful.
///
/// Never throws: private browsing, a full quota or a corrupted record all resolve
/// to `null`. A draft is a convenience, and a convenience that breaks the mint
/// page would be worse than no draft at all.
export async function loadMintDraft(): Promise<MintDraft | null> {
  try {
    const draft = await withStore<MintDraft | undefined>("readonly", (store) => store.get(KEY));
    if (!draft) return null;
    if (!draft.savedAt || Date.now() - draft.savedAt > MAX_AGE_MS) {
      await clearMintDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/// Persists the draft. Failures are swallowed for the same reason as above — a
/// quota error must not interrupt a mint in progress.
export async function saveMintDraft(draft: Omit<MintDraft, "savedAt">): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.put({ ...draft, savedAt: Date.now() }, KEY));
  } catch {
    // Deliberately ignored. See the doc comment.
  }
}

export async function clearMintDraft(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(KEY));
  } catch {
    // Deliberately ignored.
  }
}
