/**
 * IndexedDB Offline Storage and Sync Queue for Motif.
 * Enables zero-latency startup and full offline note viewing and editing.
 */

import { Notebook } from '@/hooks/useNotebooks';
import { DocumentState } from '@/components/CustomCanvas';

const DB_NAME = 'cubnotes_offline_db';
const DB_VERSION = 1;

export interface CachedPageRecord {
  pageId: string;
  documentState: DocumentState;
  updatedAt: number;
  isDirty: boolean;
}

export interface SyncAction {
  id: string;
  action: 'save_canvas' | 'update_page_title';
  pageId: string;
  payload: any;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('notebooks')) {
          db.createObjectStore('notebooks');
        }
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages', { keyPath: 'pageId' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        console.warn('Failed to open IndexedDB:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB unavailable:', err);
      resolve(null);
    }
  });
}

// --- Notebook Hierarchy Cache ---

export async function getCachedNotebooks(): Promise<Notebook[] | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('notebooks', 'readonly');
      const store = tx.objectStore('notebooks');
      const req = store.get('hierarchy');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedNotebooks(notebooks: Notebook[]): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('notebooks', 'readwrite');
      const store = tx.objectStore('notebooks');
      store.put(notebooks, 'hierarchy');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// --- Page State Cache ---

export async function getCachedPageState(pageId: string): Promise<DocumentState | null> {
  const record = await getCachedPageRecord(pageId);
  return record ? record.documentState : null;
}

export async function getCachedPageRecord(pageId: string): Promise<CachedPageRecord | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const req = store.get(pageId);
      req.onsuccess = () => {
        resolve((req.result as CachedPageRecord) || null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedPageState(
  pageId: string,
  state: DocumentState,
  isDirty: boolean = false
): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      const record: CachedPageRecord = {
        pageId,
        documentState: state,
        updatedAt: (state as any)?._clientUpdatedAt || Date.now(),
        isDirty,
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// --- Sync Queue for Offline Edits ---

export async function queueOfflineSync(action: SyncAction): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function replayPendingSync(supabase: any): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  try {
    const pending = await getPendingSyncActions();
    if (!pending || pending.length === 0) return 0;

    let syncedCount = 0;
    for (const action of pending) {
      if (action.action === 'save_canvas') {
        const { error } = await supabase
          .from('pages')
          .update({ document_state: action.payload })
          .eq('id', action.pageId);

        if (!error) {
          await removeSyncAction(action.id);
          const cached = await getCachedPageRecord(action.pageId);
          if (cached) {
            await setCachedPageState(action.pageId, cached.documentState, false);
          }
          syncedCount++;
        }
      }
    }
    return syncedCount;
  } catch (err) {
    console.warn("Error replaying sync queue:", err);
    return 0;
  }
}

export async function getPendingSyncActions(): Promise<SyncAction[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removeSyncAction(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// --- Trash & Data Recovery Utilities ---

export async function getAllCachedPages(): Promise<CachedPageRecord[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as CachedPageRecord[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removeCachedPage(pageId: string): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      store.delete(pageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getCachedTrash(): Promise<any[] | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('notebooks', 'readonly');
      const store = tx.objectStore('notebooks');
      const req = store.get('trash');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setCachedTrash(trash: any[]): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('notebooks', 'readwrite');
      const store = tx.objectStore('notebooks');
      store.put(trash, 'trash');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

