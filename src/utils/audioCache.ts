const DB_NAME = "amr-lesson-tts-cache";
const STORE_NAME = "audio_clips";
const DB_VERSION = 1;

export interface CachedAudioClip {
  key: string;
  chapterId: string;
  voiceName: string;
  stylePresetId: string;
  text: string;
  wavBytes: Uint8Array;
  durationSec: number;
  createdAt: number;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function buildAudioCacheKey(
  chapterId: string,
  voiceName: string,
  stylePresetId: string,
  text: string
): string {
  // Simple deterministic hash for text content
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${chapterId}::${voiceName}::${stylePresetId}::${hash}`;
}

export async function saveCachedAudio(clip: CachedAudioClip): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(clip);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage errors gracefully
  }
}

export async function loadAllCachedAudio(): Promise<CachedAudioClip[]> {
  try {
    const db = await openCacheDb();
    const clips = await new Promise<CachedAudioClip[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as CachedAudioClip[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return clips;
  } catch {
    return [];
  }
}
