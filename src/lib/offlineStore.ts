/**
 * IndexedDB Offline Storage and Sync Queue for CubNotes.
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
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const req = store.get(pageId);
      req.onsuccess = () => {
        const record = req.result as CachedPageRecord | undefined;
        resolve(record ? record.documentState : null);
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
        updatedAt: Date.now(),
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
