import { initializeApp, onLog } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export const FIRESTORE_QUOTA_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
export const FIRESTORE_PRICING_URL = 'https://firebase.google.com/pricing#cloud-firestore';

export class FirestoreQuotaError extends Error {
  readonly isQuotaExceeded = true;
  readonly path: string | null;
  readonly operationType: OperationType;

  constructor(message: string, operationType: OperationType, path: string | null) {
    super(message);
    this.name = 'FirestoreQuotaError';
    this.operationType = operationType;
    this.path = path;
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof FirestoreQuotaError) return true;
  const code = (error as { code?: string } | null)?.code;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Free daily write units per project')
  );
}

const QUOTA_STORAGE_KEY = `ddgm_firestore_quota_utc_${firebaseConfig.projectId}`;
const quotaListeners = new Set<() => void>();
const pendingQuotaAborters = new Set<(err: FirestoreQuotaError) => void>();
let inMemoryQuotaPaused = false;

function getTodayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isPersistedQuotaPaused(): boolean {
  if (inMemoryQuotaPaused) return true;
  try {
    const stored = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (stored === getTodayUtcKey()) {
      inMemoryQuotaPaused = true;
      return true;
    }
    if (stored && stored !== getTodayUtcKey()) {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return false;
}

export function markQuotaExceeded(reason = 'Free daily write units per project exceeded'): void {
  const alreadyPaused = inMemoryQuotaPaused;
  inMemoryQuotaPaused = true;
  try {
    localStorage.setItem(QUOTA_STORAGE_KEY, getTodayUtcKey());
  } catch {
    // Ignore storage access errors
  }

  for (const abort of Array.from(pendingQuotaAborters)) {
    abort(new FirestoreQuotaError(reason, OperationType.WRITE, null));
  }
  pendingQuotaAborters.clear();

  if (!alreadyPaused) {
    // Stop Firestore WriteStream exponential backoff loop immediately
    void disableNetwork(db).catch(() => undefined);
    for (const cb of quotaListeners) {
      try {
        cb();
      } catch {
        // Ignore listener errors
      }
    }
  }
}

export async function clearQuotaExceeded(): Promise<void> {
  inMemoryQuotaPaused = false;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
  } catch {
    // Ignore
  }
  try {
    await enableNetwork(db);
  } catch {
    // Ignore
  }
}

export function subscribeQuotaExceeded(cb: () => void): () => void {
  quotaListeners.add(cb);
  return () => {
    quotaListeners.delete(cb);
  };
}

export function raceWithQuotaAbort<T>(
  promise: Promise<T>,
  operationType: OperationType,
  path: string
): Promise<T> {
  if (isPersistedQuotaPaused()) {
    return Promise.reject(
      new FirestoreQuotaError('Daily Firestore write quota paused.', operationType, path)
    );
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = (err: FirestoreQuotaError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingQuotaAborters.delete(onAbort);
      reject(new FirestoreQuotaError(err.message, operationType, path));
    };

    pendingQuotaAborters.add(onAbort);

    const timer = setTimeout(() => {
      if (settled) return;
      if (isPersistedQuotaPaused()) {
        onAbort(new FirestoreQuotaError('Daily Firestore write quota reached.', operationType, path));
      }
    }, 8000);

    promise.then(
      (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pendingQuotaAborters.delete(onAbort);
        resolve(val);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pendingQuotaAborters.delete(onAbort);
        if (isQuotaExceededError(err)) {
          markQuotaExceeded(err instanceof Error ? err.message : String(err));
        }
        reject(err);
      }
    );
  });
}

// Intercept Firestore SDK WriteStream backoff logs for resource-exhausted
onLog(({ message, args }) => {
  const combined = `${message} ${args.map((a) => String(a)).join(' ')}`;
  if (
    combined.includes('resource-exhausted') ||
    combined.includes('Quota limit exceeded') ||
    combined.includes('Free daily write units per project')
  ) {
    markQuotaExceeded(combined);
  }
});

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
      return false;
    }
    return true;
  }
}

testConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isQuotaExceededError(error)) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    markQuotaExceeded(rawMsg);
    throw new FirestoreQuotaError(rawMsg, operationType, path);
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
