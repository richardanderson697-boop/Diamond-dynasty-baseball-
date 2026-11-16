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
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ScheduleDay } from '../engine/baseballEngine';
import {
  DraftHistoryEntry,
  DraftPick,
  DraftSlot,
  FranchiseSummary,
  LeagueRecord,
  Player,
  SeasonSnapshot,
  SavedPlayerCard,
} from '../types/baseball';

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

// ============================================================================
// FRANCHISE & PARTITIONED CHUNK PERSISTENCE
// ============================================================================

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
    seasonStats: p.seasonStats || {},
    careerStats: p.careerStats || {},
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

export async function saveFullFranchiseToCloud(
  payload: FullFranchisePayload,
  isNew: boolean
): Promise<void> {
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
  try {
    const batch = writeBatch(db);
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

    if (isNew) {
      await setDoc(franchiseRef, {
        ownerId,
        ...rootData,
        createdAt: serverTimestamp(),
      });
    } else {
      batch.update(franchiseRef, rootData);
    }

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

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, franchisePath);
  }
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
        const { _inDraftPool, ...player } = item;
        if (_inDraftPool) draftPool.push(player as Player);
        else players.push(player as Player);
      }
    }

    const schedDoc = snap.docs.find((d) => d.id === 'draft_and_schedule');
    if (schedDoc) {
      const data = schedDoc.data();
      schedule = decodeScheduleFromFirestore(data.items || []);
      draftPicks = (data.draftPicks || []) as DraftPick[];
      draftOrder = (data.draftOrder || []) as DraftSlot[];
      draftHistory = (data.draftHistory || []) as DraftHistoryEntry[];
    }

    return { players, draftPool, schedule, draftPicks, draftOrder, draftHistory };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function deleteFranchiseFromCloud(franchiseId: string): Promise<void> {
  const path = `franchises/${franchiseId}`;
  try {
    await deleteDoc(doc(db, 'franchises', franchiseId));
  } catch (error) {
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
      seasonStats: card.seasonStats || {},
      careerStats: card.careerStats || {},
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
      await setDoc(ref, {
        ownerId: card.ownerId,
        franchiseId: card.franchiseId,
        playerId: card.playerId,
        isCustom: Boolean(card.isCustom),
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteSavedPlayerCard(franchiseId: string, cardId: string): Promise<void> {
  const path = `franchises/${franchiseId}/savedPlayers/${cardId}`;
  try {
    await deleteDoc(doc(db, 'franchises', franchiseId, 'savedPlayers', cardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// HISTORICAL PERFORMANCE TREND SNAPSHOTS & RECORDS
// ============================================================================

export async function recordSeasonSnapshot(
  snapshot: Omit<SeasonSnapshot, 'id' | 'createdAt'>
): Promise<void> {
  const snapId = `SNAP_${snapshot.year}_D${snapshot.day}${snapshot.isSeasonEnd ? '_FINAL' : ''}`;
  const path = `franchises/${snapshot.franchiseId}/seasonSnapshots/${snapId}`;
  try {
    const ref = doc(db, 'franchises', snapshot.franchiseId, 'seasonSnapshots', snapId);
    await setDoc(ref, {
      ...snapshot,
      topHrLeader: snapshot.topHrLeader.slice(0, 100),
      topEraLeader: snapshot.topEraLeader.slice(0, 100),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function upsertLeagueRecords(
  franchiseId: string,
  records: Array<Omit<LeagueRecord, 'id' | 'updatedAt'>>,
  existingRecords: LeagueRecord[]
): Promise<void> {
  if (records.length === 0) return;
  const path = `franchises/${franchiseId}/records`;
  const existingKeys = new Set(existingRecords.map((r) => r.recordKey));

  try {
    const batch = writeBatch(db);
    for (const rec of records) {
      const ref = doc(db, 'franchises', franchiseId, 'records', rec.recordKey);
      if (existingKeys.has(rec.recordKey)) {
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
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
