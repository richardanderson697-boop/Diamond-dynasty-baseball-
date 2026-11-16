import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  clearQuotaExceeded,
  db,
  FirestoreQuotaError,
  handleFirestoreError,
  isPersistedQuotaPaused,
  isQuotaExceededError,
  markQuotaExceeded,
  OperationType,
  raceWithQuotaAbort,
} from '../firebase';
import { createEmptySeasonStats, ScheduleDay } from '../engine/baseballEngine';
import {
  DraftHistoryEntry,
  DraftPick,
  DraftSlot,
  FranchiseSummary,
  GamePhase,
  LeagueRecord,
  Player,
  PlayoffResults,
  RecentGameEntry,
  SeasonSnapshot,
  SavedPlayerCard,
  Team,
  TransactionEntry,
  ChampionHistoryEntry,
} from '../types/baseball';

// ============================================================================
// SESSION QUOTA GUARD & SERIAL WRITE QUEUE
// ============================================================================

let writeQueue: Promise<void> = Promise.resolve();

export function isCloudQuotaPaused(): boolean {
  return isPersistedQuotaPaused();
}

export async function resetCloudQuotaPause(): Promise<void> {
  await clearQuotaExceeded();
}

function assertCloudWritesAllowed(operationType: OperationType, path: string): void {
  if (isPersistedQuotaPaused()) {
    throw new FirestoreQuotaError(
      'Cloud sync paused: free daily Firestore write quota exceeded.',
      operationType,
      path
    );
  }
}

function enqueueCloudWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// Encode ScheduleDay[] without nested arrays (Firestore rejects Array<Array<T>>)
export function encodeScheduleForFirestore(schedule: ScheduleDay[]): Array<{ day: number; matchups: string[] }> {
  return schedule.map((dayGames, idx) => ({
    day: idx + 1,
    matchups: dayGames.map(([h, a]) => `${h}|${a}`),
  }));
}

export function decodeScheduleFromFirestore(items: Array<{ day?: number; matchups?: string[] }>): ScheduleDay[] {
  return items.map((entry) =>
    (entry.matchups || []).map((pair) => {
      const [h, a] = pair.split('|');
      return [h, a] as [string, string];
    })
  );
}

// ============================================================================
// REAL-TIME ONSNAPSHOT LISTENERS
// ============================================================================

export function subscribeToFranchises(
  ownerId: string,
  onData: (franchises: FranchiseSummary[]) => void
): Unsubscribe {
  const path = 'franchises';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: FranchiseSummary[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FranchiseSummary, 'id'>),
        }))
        .sort((a, b) => {
          const tA = (a.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tB = (b.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tB - tA;
        });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeToSavedPlayers(
  franchiseId: string,
  ownerId: string,
  onData: (cards: SavedPlayerCard[]) => void
): Unsubscribe {
  const path = `franchises/${franchiseId}/savedPlayers`;
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: SavedPlayerCard[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SavedPlayerCard, 'id'>),
        }))
        .sort((a, b) => {
          const tA = (a.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tB = (b.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tB - tA;
        });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeToSeasonSnapshots(
  franchiseId: string,
  ownerId: string,
  onData: (snapshots: SeasonSnapshot[]) => void
): Unsubscribe {
  const path = `franchises/${franchiseId}/seasonSnapshots`;
  const q = query(
    collection(db, path),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: SeasonSnapshot[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SeasonSnapshot, 'id'>),
        }))
        .sort((a, b) => a.year - b.year || a.day - b.day);
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeToLeagueRecords(
  franchiseId: string,
  ownerId: string,
  onData: (records: LeagueRecord[]) => void
): Unsubscribe {
  const path = `franchises/${franchiseId}/records`;
  const q = query(
    collection(db, path),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: LeagueRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<LeagueRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

function compactStatsForFirestore(stats: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!stats) return out;
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number' && v !== 0 && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

function rehydratePlayerFromFirestore(raw: Player & { _inDraftPool?: boolean }): {
  player: Player;
  inDraftPool: boolean;
} {
  const { _inDraftPool, ...rest } = raw;
  const isPitcher = Boolean(rest.isPitcher);
  return {
    inDraftPool: Boolean(_inDraftPool),
    player: {
      ...rest,
      seasonStats: { ...createEmptySeasonStats(isPitcher), ...(rest.seasonStats || {}) },
      careerStats: { ...createEmptySeasonStats(isPitcher), ...(rest.careerStats || {}) },
    },
  };
}

function sanitizePlayerForFirestore(p: Player): Record<string, unknown> {
  const clean: Record<string, unknown> = {
    id: p.id,
    name: p.name.slice(0, 64),
    age: Math.round(p.age),
    bats: p.bats,
    throws: p.throws,
    isPitcher: Boolean(p.isPitcher),
    position: p.position,
    teamId: p.teamId ?? null,
    ovr: Math.round(p.ovr),
    potential: Math.round(p.potential),
    seasonStats: compactStatsForFirestore(p.seasonStats),
    careerStats: compactStatsForFirestore(p.careerStats),
  };
  if (p.power !== undefined) clean.power = Math.round(p.power);
  if (p.speed !== undefined) clean.speed = Math.round(p.speed);
  if (p.glove !== undefined) clean.glove = Math.round(p.glove);
  if (p.velocity !== undefined) clean.velocity = Math.round(p.velocity);
  if (p.control !== undefined) clean.control = Math.round(p.control);
  if (p.finesse !== undefined) clean.finesse = Math.round(p.finesse);
  if (p.draftYear !== undefined) clean.draftYear = Math.round(p.draftYear);
  return clean;
}

export interface FullFranchisePayload {
  franchiseId: string;
  ownerId: string;
  name: string;
  userTeamId: string;
  year: number;
  phase: FranchiseSummary['phase'];
  currentDay: number;
  currentPickIdx: number;
  teams: FranchiseSummary['teams'];
  championsHistory: FranchiseSummary['championsHistory'];
  transactions: FranchiseSummary['transactions'];
  recentGames: FranchiseSummary['recentGames'];
  playoffResults?: FranchiseSummary['playoffResults'];
  players: Player[];
  draftPool: Player[];
  schedule: ScheduleDay[];
  draftPicks: DraftPick[];
  draftOrder: DraftSlot[];
  draftHistory: DraftHistoryEntry[];
}

export interface SaveFranchiseOptions {
  isNew?: boolean;
  includePlayers?: boolean;
  includeScheduleAndDraft?: boolean;
}

export async function saveFullFranchiseToCloud(
  payload: FullFranchisePayload,
  options: SaveFranchiseOptions = {}
): Promise<void> {
  const isNew = Boolean(options.isNew);
  const includePlayers = isNew || options.includePlayers !== false;
  const includeScheduleAndDraft = isNew || options.includeScheduleAndDraft !== false;

  const {
    franchiseId,
    ownerId,
    name,
    userTeamId,
    year,
    phase,
    currentDay,
    currentPickIdx,
    teams,
    championsHistory,
    transactions,
    recentGames,
    playoffResults,
    players,
    draftPool,
    schedule,
    draftPicks,
    draftOrder,
    draftHistory,
  } = payload;

  const franchisePath = `franchises/${franchiseId}`;
  const opType = isNew ? OperationType.CREATE : OperationType.UPDATE;

  return enqueueCloudWrite(async () => {
    assertCloudWritesAllowed(opType, franchisePath);
    try {
      const franchiseRef = doc(db, 'franchises', franchiseId);

      const rootData: Record<string, unknown> = {
        name: name.slice(0, 100),
        userTeamId,
        year,
        phase,
        currentDay,
        currentPickIdx,
        teams: teams.slice(0, 32),
        championsHistory: championsHistory.slice(0, 100),
        transactions: transactions.slice(0, 150),
        recentGames: recentGames.slice(0, 50),
        playoffResults: playoffResults ?? null,
        updatedAt: serverTimestamp(),
      };

      // Lightweight root-only update when chunks are unchanged
      if (!isNew && !includePlayers && !includeScheduleAndDraft) {
        await raceWithQuotaAbort(updateDoc(franchiseRef, rootData), opType, franchisePath);
        return;
      }

      const batch = writeBatch(db);

      if (isNew) {
        await raceWithQuotaAbort(
          setDoc(franchiseRef, {
            ownerId,
            ...rootData,
            createdAt: serverTimestamp(),
          }),
          opType,
          franchisePath
        );
      } else {
        batch.update(franchiseRef, rootData);
      }

      if (includePlayers) {
        // Partition active players + draftPool into chunks of 400 (max 500 per rule)
        const combinedPlayers = [
          ...players.map((p) => ({ ...sanitizePlayerForFirestore(p), _inDraftPool: false })),
          ...draftPool.map((p) => ({ ...sanitizePlayerForFirestore(p), _inDraftPool: true })),
        ];

        const chunkSize = 400;
        const chunkCount = Math.max(4, Math.ceil(combinedPlayers.length / chunkSize));
        for (let i = 0; i < chunkCount; i++) {
          const slice = combinedPlayers.slice(i * chunkSize, (i + 1) * chunkSize);
          const chunkRef = doc(db, 'franchises', franchiseId, 'stateChunks', `players_${i}`);
          const chunkBody = {
            ownerId,
            franchiseId,
            chunkType: 'PLAYERS',
            items: slice,
            updatedAt: serverTimestamp(),
          };
          if (isNew) {
            batch.set(chunkRef, chunkBody);
          } else {
            batch.set(chunkRef, chunkBody, { merge: true });
          }
        }
      }

      if (includeScheduleAndDraft) {
        const schedRef = doc(db, 'franchises', franchiseId, 'stateChunks', 'draft_and_schedule');
        const schedBody = {
          ownerId,
          franchiseId,
          chunkType: 'DRAFT_AND_SCHEDULE',
          items: encodeScheduleForFirestore(schedule),
          draftPicks: draftPicks.slice(0, 500),
          draftOrder: draftOrder.slice(0, 1000),
          draftHistory: draftHistory.slice(0, 1000).map((h) => ({
            ...h,
            player: sanitizePlayerForFirestore(h.player),
          })),
          updatedAt: serverTimestamp(),
        };

        if (isNew) {
          batch.set(schedRef, schedBody);
        } else {
          batch.set(schedRef, schedBody, { merge: true });
        }
      }

      await raceWithQuotaAbort(batch.commit(), opType, franchisePath);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        markQuotaExceeded(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, opType, franchisePath);
    }
  });
}

export async function loadFranchiseChunksFromCloud(franchiseId: string, ownerId: string): Promise<{
  players: Player[];
  draftPool: Player[];
  schedule: ScheduleDay[];
  draftPicks: DraftPick[];
  draftOrder: DraftSlot[];
  draftHistory: DraftHistoryEntry[];
}> {
  const path = `franchises/${franchiseId}/stateChunks`;
  try {
    const q = query(collection(db, path), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);

    const players: Player[] = [];
    const draftPool: Player[] = [];
    let schedule: ScheduleDay[] = [];
    let draftPicks: DraftPick[] = [];
    let draftOrder: DraftSlot[] = [];
    let draftHistory: DraftHistoryEntry[] = [];

    const playerDocs = snap.docs
      .filter((d) => d.id.startsWith('players_'))
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const d of playerDocs) {
      const data = d.data();
      const items = (data.items || []) as Array<Player & { _inDraftPool?: boolean }>;
      for (const item of items) {
        const { player, inDraftPool } = rehydratePlayerFromFirestore(item);
        if (inDraftPool) draftPool.push(player);
        else players.push(player);
      }
    }

    const schedDoc = snap.docs.find((d) => d.id === 'draft_and_schedule');
    if (schedDoc) {
      const data = schedDoc.data();
      schedule = decodeScheduleFromFirestore(data.items || []);
      draftPicks = (data.draftPicks || []) as DraftPick[];
      draftOrder = (data.draftOrder || []) as DraftSlot[];
      draftHistory = ((data.draftHistory || []) as DraftHistoryEntry[]).map((h) => ({
        ...h,
        player: rehydratePlayerFromFirestore(h.player).player,
      }));
    }

    return { players, draftPool, schedule, draftPicks, draftOrder, draftHistory };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteFranchiseFromCloud(franchiseId: string): Promise<void> {
  const path = `franchises/${franchiseId}`;
  assertCloudWritesAllowed(OperationType.DELETE, path);
  try {
    await raceWithQuotaAbort(deleteDoc(doc(db, 'franchises', franchiseId)), OperationType.DELETE, path);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markQuotaExceeded(error instanceof Error ? error.message : String(error));
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// SAVED & CUSTOM PLAYER CARDS
// ============================================================================

export async function upsertSavedPlayerCard(
  card: Omit<SavedPlayerCard, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const path = `franchises/${card.franchiseId}/savedPlayers/${card.id}`;
  const opType = isNew ? OperationType.CREATE : OperationType.UPDATE;
  return enqueueCloudWrite(async () => {
    assertCloudWritesAllowed(opType, path);
    try {
      const ref = doc(db, 'franchises', card.franchiseId, 'savedPlayers', card.id);
      const payload: Record<string, unknown> = {
        name: card.name.slice(0, 64),
        age: Math.round(card.age),
        bats: card.bats,
        throws: card.throws,
        isPitcher: Boolean(card.isPitcher),
        position: card.position,
        teamId: card.teamId.slice(0, 10),
        ovr: Math.round(card.ovr),
        potential: Math.round(card.potential),
        cardTheme: card.cardTheme,
        notes: (card.notes || '').slice(0, 300),
        seasonStats: compactStatsForFirestore(card.seasonStats),
        careerStats: compactStatsForFirestore(card.careerStats),
        seasonHistory: (card.seasonHistory || []).slice(0, 30),
        updatedAt: serverTimestamp(),
      };
      if (card.power !== undefined) payload.power = Math.round(card.power);
      if (card.speed !== undefined) payload.speed = Math.round(card.speed);
      if (card.glove !== undefined) payload.glove = Math.round(card.glove);
      if (card.velocity !== undefined) payload.velocity = Math.round(card.velocity);
      if (card.control !== undefined) payload.control = Math.round(card.control);
      if (card.finesse !== undefined) payload.finesse = Math.round(card.finesse);

      if (isNew) {
        await raceWithQuotaAbort(
          setDoc(ref, {
            ownerId: card.ownerId,
            franchiseId: card.franchiseId,
            playerId: card.playerId,
            isCustom: Boolean(card.isCustom),
            ...payload,
            createdAt: serverTimestamp(),
          }),
          opType,
          path
        );
      } else {
        await raceWithQuotaAbort(updateDoc(ref, payload), opType, path);
      }
    } catch (error) {
      if (isQuotaExceededError(error)) {
        markQuotaExceeded(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, opType, path);
    }
  });
}

export async function deleteSavedPlayerCard(franchiseId: string, cardId: string): Promise<void> {
  const path = `franchises/${franchiseId}/savedPlayers/${cardId}`;
  return enqueueCloudWrite(async () => {
    assertCloudWritesAllowed(OperationType.DELETE, path);
    try {
      await raceWithQuotaAbort(
        deleteDoc(doc(db, 'franchises', franchiseId, 'savedPlayers', cardId)),
        OperationType.DELETE,
        path
      );
    } catch (error) {
      if (isQuotaExceededError(error)) {
        markQuotaExceeded(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

// ============================================================================
// HISTORICAL PERFORMANCE TREND SNAPSHOTS & RECORDS
// ============================================================================

export async function recordSeasonSnapshot(
  snapshot: Omit<SeasonSnapshot, 'id' | 'createdAt'>
): Promise<void> {
  const snapId = `SNAP_${snapshot.year}_D${snapshot.day}${snapshot.isSeasonEnd ? '_FINAL' : ''}`;
  const path = `franchises/${snapshot.franchiseId}/seasonSnapshots/${snapId}`;
  return enqueueCloudWrite(async () => {
    assertCloudWritesAllowed(OperationType.CREATE, path);
    try {
      const ref = doc(db, 'franchises', snapshot.franchiseId, 'seasonSnapshots', snapId);
      await raceWithQuotaAbort(
        setDoc(ref, {
          ...snapshot,
          topHrLeader: snapshot.topHrLeader.slice(0, 100),
          topEraLeader: snapshot.topEraLeader.slice(0, 100),
          createdAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        path
      );
    } catch (error) {
      if (isQuotaExceededError(error)) {
        markQuotaExceeded(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  });
}

export async function upsertLeagueRecords(
  franchiseId: string,
  records: Array<Omit<LeagueRecord, 'id' | 'updatedAt'>>,
  existingRecords: LeagueRecord[]
): Promise<void> {
  if (records.length === 0) return;
  const path = `franchises/${franchiseId}/records`;
  const existingMap = new Map(existingRecords.map((r) => [r.recordKey, r]));

  // Filter out no-op updates
  const changedRecords = records.filter((rec) => {
    const prev = existingMap.get(rec.recordKey);
    if (!prev) return true;
    return (
      prev.value !== rec.value ||
      prev.holderName !== rec.holderName ||
      prev.teamId !== rec.teamId
    );
  });

  if (changedRecords.length === 0) return;

  return enqueueCloudWrite(async () => {
    assertCloudWritesAllowed(OperationType.WRITE, path);
    try {
      const batch = writeBatch(db);
      for (const rec of changedRecords) {
        const ref = doc(db, 'franchises', franchiseId, 'records', rec.recordKey);
        if (existingMap.has(rec.recordKey)) {
          batch.update(ref, {
            holderName: rec.holderName.slice(0, 64),
            teamId: rec.teamId.slice(0, 10),
            value: rec.value,
            displayValue: rec.displayValue.slice(0, 32),
            year: rec.year,
            day: rec.day,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, {
            ...rec,
            scopeLabel: rec.scopeLabel.slice(0, 40),
            title: rec.title.slice(0, 64),
            holderName: rec.holderName.slice(0, 64),
            teamId: rec.teamId.slice(0, 10),
            displayValue: rec.displayValue.slice(0, 32),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await raceWithQuotaAbort(batch.commit(), OperationType.WRITE, path);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        markQuotaExceeded(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

// ============================================================================
// LOCALSTORAGE FALLBACK PERSISTENCE (OFFLINE & QUOTA-EXCEEDED RESILIENCE)
// ============================================================================

export interface LocalFranchiseBackup {
  franchiseId: string;
  ownerId: string;
  name: string;
  userTeamId: string;
  year: number;
  phase: GamePhase;
  currentDay: number;
  currentPickIdx: number;
  teams: Team[];
  players: Player[];
  draftPool: Player[];
  schedule: ScheduleDay[];
  draftPicks: DraftPick[];
  draftOrder: DraftSlot[];
  draftHistory: DraftHistoryEntry[];
  playoffResults: PlayoffResults | null;
  championsHistory: ChampionHistoryEntry[];
  transactions: TransactionEntry[];
  recentGames: RecentGameEntry[];
  savedCards: SavedPlayerCard[];
  seasonSnapshots: SeasonSnapshot[];
  leagueRecords: LeagueRecord[];
  savedAtMs: number;
}

const LOCAL_PREFIX = 'ddgm_backup_v1_';
const LOCAL_INDEX_KEY = 'ddgm_backup_index_v1';

export interface LocalBackupMeta {
  franchiseId: string;
  name: string;
  userTeamId: string;
  year: number;
  currentDay: number;
  wins: number;
  losses: number;
  savedAtMs: number;
}

export function saveLocalFranchiseBackup(backup: LocalFranchiseBackup): void {
  try {
    localStorage.setItem(`${LOCAL_PREFIX}${backup.franchiseId}`, JSON.stringify(backup));
    const userTeam = backup.teams.find((t) => t.id === backup.userTeamId);
    const meta: LocalBackupMeta = {
      franchiseId: backup.franchiseId,
      name: backup.name,
      userTeamId: backup.userTeamId,
      year: backup.year,
      currentDay: backup.currentDay,
      wins: userTeam?.wins ?? 0,
      losses: userTeam?.losses ?? 0,
      savedAtMs: backup.savedAtMs,
    };
    const existingList = listLocalFranchiseBackups().filter((m) => m.franchiseId !== backup.franchiseId);
    const nextList = [meta, ...existingList].slice(0, 3);
    // Prune evicted backups from storage
    const keepIds = new Set(nextList.map((m) => m.franchiseId));
    existingList.forEach((oldMeta) => {
      if (!keepIds.has(oldMeta.franchiseId)) {
        localStorage.removeItem(`${LOCAL_PREFIX}${oldMeta.franchiseId}`);
      }
    });
    localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(nextList));
  } catch {
    // Ignore localStorage quota/privacy mode errors silently
  }
}

export function loadLocalFranchiseBackup(franchiseId: string): LocalFranchiseBackup | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${franchiseId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalFranchiseBackup;
  } catch {
    return null;
  }
}

export function listLocalFranchiseBackups(): LocalBackupMeta[] {
  try {
    const raw = localStorage.getItem(LOCAL_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalBackupMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function deleteLocalFranchiseBackup(franchiseId: string): void {
  try {
    localStorage.removeItem(`${LOCAL_PREFIX}${franchiseId}`);
    const filtered = listLocalFranchiseBackups().filter((m) => m.franchiseId !== franchiseId);
    localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore
  }
}
