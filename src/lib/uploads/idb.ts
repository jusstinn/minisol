/**
 * The customer's own files, kept in their browser (IndexedDB) — never on our servers.
 *
 * Database "blueprint-uploads", object store "files". Keys, per retailer + member
 * (the same scope as the saved session, see savedSession.ts):
 *   `${tenant}:${memberId}:model:meta` / `…:model:blob` — the 3D model file + its placement
 *   `${tenant}:${memberId}:plan:meta`  / `…:plan:blob`  — the plan image + its calibration
 * The meta records carry `project`: the id of the conversation's first message, which the
 * saved session keeps across reloads. A new project doesn't match it, so the previous
 * project's files are dropped instead of showing up in the wrong sketch. "Forget my saved
 * project" deletes them too (clearUploads). Every call degrades to "not saved" when
 * IndexedDB is unavailable (private mode, quota) — the files still work until the tab closes.
 */

const DB_NAME = "blueprint-uploads";
const STORE = "files";

export type UploadSlot = "model" | "plan";
export const uploadKey = (scope: string, slot: UploadSlot, part: "meta" | "blob") => `${scope}:${slot}:${part}`;
export const uploadScope = (tenant: string, memberId: string) => `${tenant}:${memberId}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }).then((db) => {
      if (!db) dbPromise = null; // try again next time
      return db;
    });
  }
  return dbPromise ?? Promise.resolve(null);
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
          tx.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idbGet = <T>(key: string) => run<T>("readonly", (s) => s.get(key));

/** True when it was written. */
export async function idbPut(entries: Record<string, unknown>): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(entries)) s.put(v, k);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(keys: string[]): Promise<void> {
  await run("readwrite", (s) => {
    for (const k of keys) s.delete(k);
  });
}

export function deleteSlot(scope: string, slot: UploadSlot): Promise<void> {
  return idbDelete([uploadKey(scope, slot, "meta"), uploadKey(scope, slot, "blob")]);
}

/** "Forget my saved project": the uploaded model and plan go with it. */
export function clearUploads(tenant: string, memberId: string): Promise<void> {
  const scope = uploadScope(tenant, memberId);
  return idbDelete((["model", "plan"] as const).flatMap((slot) => [uploadKey(scope, slot, "meta"), uploadKey(scope, slot, "blob")]));
}
