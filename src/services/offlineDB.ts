import type { StoredVisitRecord, StructuredVisitData, SyncCounts, SyncStatus } from '../types/index.ts';

const DB_NAME = 'dhwani_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'visits';

/**
 * Open or upgrade the native IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB database.'));
    };

    request.onblocked = () => {
      reject(new Error('IndexedDB database open request was blocked.'));
    };
  });
}

/**
 * Safely close an IndexedDB database connection.
 */
function closeDB(db: IDBDatabase | null | undefined): void {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

/**
 * Generate a unique ID for locally stored visits.
 */
export function generateLocalVisitId(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `local-vis-${timestamp}-${randomPart}`;
}

/**
 * Save a complete StructuredVisitData record to IndexedDB with sync status tracking.
 * - Resolves successfully ONLY after transaction.oncomplete.
 * - Rejects if transaction errors or aborts, even if individual put succeeded.
 * - Closes the DB connection on both success and failure.
 */
export async function saveVisitRecord(
  visitData: StructuredVisitData,
  options?: { id?: string; syncStatus?: SyncStatus }
): Promise<StoredVisitRecord> {
  const db = await openDB();
  const id = options?.id || generateLocalVisitId();
  const syncStatus: SyncStatus = options?.syncStatus || 'pending';
  const now = new Date().toISOString();

  const record: StoredVisitRecord = {
    id,
    visitData: JSON.parse(JSON.stringify(visitData)), // Deep clone to isolate snapshot
    syncStatus,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    let finished = false;

    const safeReject = (err: any) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      reject(err);
    };

    const safeResolve = (rec: StoredVisitRecord) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      resolve(rec);
    };

    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const putRequest = store.put(record);

      putRequest.onerror = () => {
        safeReject(putRequest.error || new Error(`Failed to save visit record ${id} to IndexedDB.`));
      };

      // 1. Resolve successfully ONLY after transaction.oncomplete
      transaction.oncomplete = () => {
        safeResolve(record);
      };

      // 2. Reject if transaction errors or aborts, even if putRequest was successful
      transaction.onerror = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction failed while saving visit ${id}.`));
      };

      transaction.onabort = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction was aborted while saving visit ${id}.`));
      };
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Retrieve all stored visit records from IndexedDB.
 * - Does not silently swallow database errors into an empty array.
 * - Closes database connection on both success and failure.
 */
export async function getAllStoredVisits(): Promise<StoredVisitRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let records: StoredVisitRecord[] = [];
    let finished = false;

    const safeReject = (err: any) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      reject(err);
    };

    const safeResolve = (data: StoredVisitRecord[]) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      resolve(data);
    };

    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        records = getAllRequest.result || [];
      };

      getAllRequest.onerror = () => {
        safeReject(getAllRequest.error || new Error('Failed to fetch stored visits from IndexedDB.'));
      };

      transaction.oncomplete = () => {
        safeResolve(records);
      };

      transaction.onerror = () => {
        safeReject(transaction.error || new Error('IndexedDB transaction failed while reading visits.'));
      };

      transaction.onabort = () => {
        safeReject(transaction.error || new Error('IndexedDB transaction was aborted while reading visits.'));
      };
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Retrieve a single visit record by ID.
 * - Closes database connection on both success and failure.
 */
export async function getStoredVisitById(id: string): Promise<StoredVisitRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let record: StoredVisitRecord | null = null;
    let finished = false;

    const safeReject = (err: any) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      reject(err);
    };

    const safeResolve = (rec: StoredVisitRecord | null) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      resolve(rec);
    };

    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        record = getRequest.result || null;
      };

      getRequest.onerror = () => {
        safeReject(getRequest.error || new Error(`Failed to fetch visit ${id} from IndexedDB.`));
      };

      transaction.oncomplete = () => {
        safeResolve(record);
      };

      transaction.onerror = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction failed while reading visit ${id}.`));
      };

      transaction.onabort = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction was aborted while reading visit ${id}.`));
      };
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Update the sync status of an existing stored visit record.
 * - Closes database connection on both success and failure.
 */
export async function updateVisitSyncStatus(
  id: string,
  syncStatus: SyncStatus,
  lastSyncError?: string
): Promise<StoredVisitRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let updatedRecord: StoredVisitRecord | null = null;
    let finished = false;

    const safeReject = (err: any) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      reject(err);
    };

    const safeResolve = (rec: StoredVisitRecord | null) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      resolve(rec);
    };

    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result as StoredVisitRecord | undefined;
        if (!record) {
          updatedRecord = null;
          return;
        }

        record.syncStatus = syncStatus;
        record.updatedAt = new Date().toISOString();
        if (lastSyncError !== undefined) {
          record.lastSyncError = lastSyncError;
        }
        if (syncStatus === 'syncing') {
          record.syncAttempts = (record.syncAttempts || 0) + 1;
        }

        const putRequest = store.put(record);
        putRequest.onsuccess = () => {
          updatedRecord = record;
        };
        putRequest.onerror = () => {
          safeReject(putRequest.error || new Error(`Failed to update sync status for ${id}.`));
        };
      };

      getRequest.onerror = () => {
        safeReject(getRequest.error || new Error(`Failed to find record ${id} to update.`));
      };

      transaction.oncomplete = () => {
        safeResolve(updatedRecord);
      };

      transaction.onerror = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction failed while updating sync status for ${id}.`));
      };

      transaction.onabort = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction was aborted while updating sync status for ${id}.`));
      };
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Delete a visit record by ID (e.g., if needed for cleanup).
 * - Closes database connection on both success and failure.
 */
export async function deleteStoredVisit(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let deleted = false;
    let finished = false;

    const safeReject = (err: any) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      reject(err);
    };

    const safeResolve = (res: boolean) => {
      if (finished) return;
      finished = true;
      closeDB(db);
      resolve(res);
    };

    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const deleteRequest = store.delete(id);

      deleteRequest.onsuccess = () => {
        deleted = true;
      };

      deleteRequest.onerror = () => {
        safeReject(deleteRequest.error || new Error(`Failed to delete record ${id}.`));
      };

      transaction.oncomplete = () => {
        safeResolve(deleted);
      };

      transaction.onerror = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction failed while deleting visit ${id}.`));
      };

      transaction.onabort = () => {
        safeReject(transaction.error || new Error(`IndexedDB transaction was aborted while deleting visit ${id}.`));
      };
    } catch (err) {
      safeReject(err);
    }
  });
}

/**
 * Compute aggregate count of stored records by sync status.
 * Pending and failed records count towards totalRequiringAttention.
 * Syncing and synced are kept separate.
 */
export function calculateSyncCounts(records: StoredVisitRecord[] = []): SyncCounts {
  let pending = 0;
  let syncing = 0;
  let synced = 0;
  let failed = 0;

  if (Array.isArray(records)) {
    for (const r of records) {
      if (r && r.syncStatus === 'pending') pending++;
      else if (r && r.syncStatus === 'failed') failed++;
      else if (r && r.syncStatus === 'syncing') syncing++;
      else if (r && r.syncStatus === 'synced') synced++;
    }
  }

  return {
    pending,
    syncing,
    synced,
    failed,
    totalRequiringAttention: pending + failed,
    total: Array.isArray(records) ? records.length : 0,
  };
}

