import {
  ChampionHistoryEntry,
  DraftHistoryEntry,
  DraftPick,
  DraftSlot,
  GamePhase,
  LeagueRecord,
  Player,
  PlayoffResults,
  RecentGameEntry,
  SavedPlayerCard,
  SeasonSnapshot,
  Team,
  TransactionEntry,
} from '../types/baseball';
import { ScheduleDay, normalizeLoadedPlayers, normalizeLoadedTeams } from '../engine/baseballEngine';
import { LocalBackupMeta, LocalFranchiseBackup } from './firestoreService';

const DB_NAME = 'ddgm_local_storage_v1';
const DB_VERSION = 1;
const STORE_NAME = 'franchises';
const SYNC_MODE_KEY = 'ddgm_cloud_sync_mode_v1';
const LEGACY_INDEX_KEY = 'ddgm_backup_index_v1';
const LEGACY_PREFIX = 'ddgm_backup_v1_';

export type CloudSyncMode = 'manual' | 'season';

export function getCloudSyncMode(): CloudSyncMode {
  try {
    const val = localStorage.getItem(SYNC_MODE_KEY);
    if (val === 'season') return 'season';
  } catch {
    // Ignore storage access errors
  }
  return 'manual';
}

export function setCloudSyncMode(mode: CloudSyncMode): void {
  try {
    localStorage.setItem(SYNC_MODE_KEY, mode);
  } catch {
    // Ignore storage access errors
  }
}

export interface StoredFranchiseRecord extends LocalFranchiseBackup {
  lastCloudSyncMs?: number;
}

function buildMetaFromRecord(rec: StoredFranchiseRecord): LocalBackupMeta & { lastCloudSyncMs?: number } {
  const userTeam = (rec.teams || []).find((t) => t.id === rec.userTeamId);
  return {
    franchiseId: rec.franchiseId,
    name: rec.name,
    userTeamId: rec.userTeamId,
    year: rec.year,
    currentDay: rec.currentDay,
    wins: userTeam?.wins ?? 0,
    losses: userTeam?.losses ?? 0,
    savedAtMs: rec.savedAtMs || Date.now(),
    lastCloudSyncMs: rec.lastCloudSyncMs,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'franchiseId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });
}

let migrationPromise: Promise<void> | null = null;

async function ensureLegacyMigration(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const rawIdx = localStorage.getItem(LEGACY_INDEX_KEY);
      if (!rawIdx) return;
      const metas = JSON.parse(rawIdx) as LocalBackupMeta[];
      if (!Array.isArray(metas) || metas.length === 0) return;

      const db = await openDatabase();
      for (const m of metas) {
        if (!m?.franchiseId) continue;
        const raw = localStorage.getItem(`${LEGACY_PREFIX}${m.franchiseId}`);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as LocalFranchiseBackup;
          await new Promise<void>((res) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(parsed.franchiseId);
            getReq.onsuccess = () => {
              const existing = getReq.result as StoredFranchiseRecord | undefined;
              if (!existing || (parsed.savedAtMs || 0) > (existing.savedAtMs || 0)) {
                store.put(parsed);
              }
            };
            tx.oncomplete = () => res();
            tx.onerror = () => res();
          });
        } catch {
          // Ignore malformed legacy entry
        }
      }
    } catch {
      // Ignore migration errors
    }
  })();
  return migrationPromise;
}

export async function saveFranchiseToIndexedDb(record: StoredFranchiseRecord): Promise<void> {
  await ensureLegacyMigration();
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
  } catch (err) {
    console.warn('IndexedDB save failed, keeping in-memory state:', err);
  }
}

export async function loadFranchiseFromIndexedDb(
  franchiseId: string
): Promise<StoredFranchiseRecord | null> {
  await ensureLegacyMigration();
  try {
    const db = await openDatabase();
    return await new Promise<StoredFranchiseRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(franchiseId);
      req.onsuccess = () => resolve((req.result as StoredFranchiseRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function listFranchisesFromIndexedDb(): Promise<
  Array<LocalBackupMeta & { lastCloudSyncMs?: number }>
> {
  await ensureLegacyMigration();
  try {
    const db = await openDatabase();
    return await new Promise<Array<LocalBackupMeta & { lastCloudSyncMs?: number }>>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredFranchiseRecord[] | undefined) || [];
        const metas = rows
          .map(buildMetaFromRecord)
          .sort((a, b) => (b.savedAtMs || 0) - (a.savedAtMs || 0));
        resolve(metas);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteFranchiseFromIndexedDb(franchiseId: string): Promise<void> {
  await ensureLegacyMigration();
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(franchiseId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

export async function markFranchiseCloudSyncedInDb(
  franchiseId: string,
  syncedAtMs: number
): Promise<void> {
  const existing = await loadFranchiseFromIndexedDb(franchiseId);
  if (!existing) return;
  await saveFranchiseToIndexedDb({
    ...existing,
    lastCloudSyncMs: syncedAtMs,
  });
}

// ============================================================================
// PORTABLE FILE EXPORT / IMPORT (.json) — $0 SERVER PORTABILITY
// ============================================================================

export function exportFranchiseToJsonFile(record: StoredFranchiseRecord): void {
  const exportPayload = {
    format: 'diamond-dynasty-gm-save-v1',
    exportedAt: new Date().toISOString(),
    franchise: record,
  };
  const blob = new Blob([JSON.stringify(exportPayload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = (record.name || record.userTeamId || 'dynasty')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-${record.year}-d${record.currentDay}.ddgm.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseImportedFranchiseFile(file: File): Promise<StoredFranchiseRecord> {
  const text = await file.text();
  const parsed = JSON.parse(text) as {
    format?: string;
    franchise?: Partial<StoredFranchiseRecord>;
  } & Partial<StoredFranchiseRecord>;

  const raw: Partial<StoredFranchiseRecord> =
    parsed && typeof parsed === 'object' && parsed.franchise ? parsed.franchise : parsed;

  if (!raw || !Array.isArray(raw.teams) || !Array.isArray(raw.players) || !raw.userTeamId) {
    throw new Error('Invalid Diamond Dynasty save file.');
  }

  const now = Date.now();
  const newId =
    typeof raw.franchiseId === 'string' && raw.franchiseId.startsWith('FRAN_')
      ? raw.franchiseId
      : `FRAN_${raw.userTeamId}_${now}`;

  return {
    franchiseId: newId,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : 'local',
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : `${raw.userTeamId} Dynasty`,
    userTeamId: raw.userTeamId,
    year: typeof raw.year === 'number' ? raw.year : 2026,
    phase: (raw.phase as GamePhase) || 'REGULAR_SEASON',
    currentDay: typeof raw.currentDay === 'number' ? raw.currentDay : 0,
    currentPickIdx: typeof raw.currentPickIdx === 'number' ? raw.currentPickIdx : 0,
    teams: normalizeLoadedTeams(raw.teams as Team[]),
    players: normalizeLoadedPlayers(raw.players as Player[]),
    draftPool: normalizeLoadedPlayers((raw.draftPool as Player[]) || []),
    schedule: (raw.schedule as ScheduleDay[]) || [],
    draftPicks: (raw.draftPicks as DraftPick[]) || [],
    draftOrder: (raw.draftOrder as DraftSlot[]) || [],
    draftHistory: (raw.draftHistory as DraftHistoryEntry[]) || [],
    playoffResults: (raw.playoffResults as PlayoffResults | null) ?? null,
    championsHistory: (raw.championsHistory as ChampionHistoryEntry[]) || [],
    transactions: (raw.transactions as TransactionEntry[]) || [],
    recentGames: (raw.recentGames as RecentGameEntry[]) || [],
    savedCards: (raw.savedCards as SavedPlayerCard[]) || [],
    seasonSnapshots: (raw.seasonSnapshots as SeasonSnapshot[]) || [],
    leagueRecords: (raw.leagueRecords as LeagueRecord[]) || [],
    savedAtMs: now,
  };
}
