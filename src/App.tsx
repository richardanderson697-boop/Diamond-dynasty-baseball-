import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Activity,
  ArrowLeftRight,
  BarChart3,
  Check,
  Cloud,
  Download,
  ExternalLink,
  FastForward,
  FileText,
  HardDrive,
  IdCard,
  ListOrdered,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  Save,
  Shield,
  SkipForward,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  Tv,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  auth,
  FIRESTORE_PRICING_URL,
  FIRESTORE_QUOTA_UPGRADE_URL,
  googleProvider,
  isQuotaExceededError,
  subscribeQuotaExceeded,
} from './firebase';
import {
  buildSeasonSnapshotData,
  calculateExtensionOffer,
  calculateFairSalary,
  calculateOverall,
  computeReleaseDeadCap,
  computeUpdatedRecords,
  createEmptySeasonStats,
  createInitialLeague,
  evaluateTradeProposal,
  formatMoney,
  generateInitialPlayerPool,
  generateRookieClass,
  generateSeasonSchedule,
  getPlayerContractYears,
  getPlayerSalary,
  getPlayerTradeValue,
  getRookieContractSalary,
  getTeamPayrollSummary,
  HARD_SALARY_CAP,
  MIN_PLAYER_SALARY,
  normalizeLoadedPlayers,
  normalizeLoadedTeams,
  resetPlayerCounter,
  ROOKIE_CONTRACT_YEARS,
  roundMoney,
  runAIOffseasonFreeAgency,
  runOffseasonRollover,
  ScheduleDay,
  selectBestDraftPickForAI,
  simulatePlayoffs,
  simulateSingleGame,
  TEAM_CONFIGS,
} from './engine/baseballEngine';
import {
  deleteFranchiseFromCloud,
  isCloudQuotaPaused,
  loadFranchiseChunksFromCloud,
  LocalBackupMeta,
  resetCloudQuotaPause,
  saveFullFranchiseToCloud,
  subscribeToFranchises,
  subscribeToLeagueRecords,
  subscribeToSavedPlayers,
  subscribeToSeasonSnapshots,
} from './services/firestoreService';
import {
  CloudSyncMode,
  deleteFranchiseFromIndexedDb,
  exportFranchiseToJsonFile,
  getCloudSyncMode,
  listFranchisesFromIndexedDb,
  loadFranchiseFromIndexedDb,
  markFranchiseCloudSyncedInDb,
  parseImportedFranchiseFile,
  saveFranchiseToIndexedDb,
  setCloudSyncMode,
  StoredFranchiseRecord,
} from './services/localDbService';
import {
  CardTheme,
  ChampionHistoryEntry,
  DraftHistoryEntry,
  DraftPick,
  DraftSlot,
  FranchiseSummary,
  GamePhase,
  LeagueRecord,
  Player,
  PlayerPosition,
  PlayoffResults,
  RecentGameEntry,
  RetiredPlayerSummary,
  SavedPlayerCard,
  SeasonSnapshot,
  Team,
  TransactionEntry,
} from './types/baseball';
import { TeamBadge } from './components/SharedBadges';
import { PlayerCardModal } from './components/PlayerCardModal';
import { PlayerCardStudio } from './components/PlayerCardStudio';
import { TrendsDashboardView } from './components/TrendsDashboardView';
import { StandingsAndRecordsView } from './components/StandingsAndRecordsView';
import { DashboardView } from './components/DashboardView';
import { RosterView } from './components/RosterView';
import { WaiverPoolView } from './components/WaiverPoolView';
import { TradeCenterView } from './components/TradeCenterView';
import { DraftRoomView } from './components/DraftRoomView';
import { TransactionsLogView } from './components/TransactionsLogView';
import { LiveGameCanvas, LiveGameResult } from './components/LiveGameCanvas';
import { RetirementsModal } from './components/RetirementsModal';
import { OffseasonFreeAgencyView } from './components/OffseasonFreeAgencyView';

export default function App() {
  // Firebase Auth State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Cloud Franchise Registry & Local-First Sync State
  const [cloudFranchises, setCloudFranchises] = useState<FranchiseSummary[]>([]);
  const [localBackups, setLocalBackups] = useState<Array<LocalBackupMeta & { lastCloudSyncMs?: number }>>([]);
  const [activeFranchiseId, setActiveFranchiseId] = useState<string | null>(null);
  const [cloudSyncMode, setCloudSyncModeState] = useState<CloudSyncMode>(() => getCloudSyncMode());
  const [hasUnsyncedCloudChanges, setHasUnsyncedCloudChanges] = useState(false);
  const [loadedFromLegacyCloud, setLoadedFromLegacyCloud] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'synced' | 'quota' | 'error'>(() =>
    isCloudQuotaPaused() ? 'quota' : 'idle'
  );
  const [loadingFranchiseId, setLoadingFranchiseId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Game Lifecycle States
  const [phase, setPhase] = useState<GamePhase>('SETUP');
  const [year, setYear] = useState(2026);
  const [userTeamId, setUserTeamId] = useState('NYY');

  // Core League Data
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [currentDay, setCurrentDay] = useState(0);

  // Draft Room State
  const [draftOrder, setDraftOrder] = useState<DraftSlot[]>([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [draftPool, setDraftPool] = useState<Player[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([]);

  // Playoff & History State
  const [playoffResults, setPlayoffResults] = useState<PlayoffResults | null>(null);
  const [championsHistory, setChampionsHistory] = useState<ChampionHistoryEntry[]>([]);
  const [transactions, setTransactions] = useState<TransactionEntry[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGameEntry[]>([]);

  // Real-time Firebase / Local Subcollection States
  const [savedCards, setSavedCards] = useState<SavedPlayerCard[]>([]);
  const [seasonSnapshots, setSeasonSnapshots] = useState<SeasonSnapshot[]>([]);
  const [leagueRecords, setLeagueRecords] = useState<LeagueRecord[]>([]);

  // UI Navigation & Modals
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [retirementsSummary, setRetirementsSummary] = useState<{
    year: number;
    retirements: RetiredPlayerSummary[];
    expiringUserCount: number;
    aiReSignedCount: number;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: string; id: number } | null>(null);

  const showToast = useCallback((text: string, type = 'info') => {
    setToastMsg({ text, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Load On-Device IndexedDB Dynasties on Startup
  useEffect(() => {
    void listFranchisesFromIndexedDb().then(setLocalBackups);
  }, []);

  // Auth & Quota Listeners
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    const unsubQuota = subscribeQuotaExceeded(() => {
      setSyncState('quota');
      showToast('Daily Firestore write quota reached. On-device IndexedDB auto-save remains active.', 'warning');
    });
    return () => {
      unsubAuth();
      unsubQuota();
    };
  }, [showToast]);

  // Real-time Franchises List Subscription (metadata list only)
  useEffect(() => {
    if (!authReady || !authUser) {
      setCloudFranchises([]);
      return;
    }
    const unsub = subscribeToFranchises(authUser.uid, (list) => {
      setCloudFranchises(list);
    });
    return () => unsub();
  }, [authReady, authUser]);

  // Legacy Subcollection Subscriptions (only used if resuming an older pre-bundle cloud save)
  useEffect(() => {
    if (!loadedFromLegacyCloud || !authReady || !authUser || !activeFranchiseId) return;
    const unsubCards = subscribeToSavedPlayers(activeFranchiseId, authUser.uid, setSavedCards);
    const unsubSnaps = subscribeToSeasonSnapshots(activeFranchiseId, authUser.uid, setSeasonSnapshots);
    const unsubRecs = subscribeToLeagueRecords(activeFranchiseId, authUser.uid, setLeagueRecords);

    return () => {
      unsubCards();
      unsubSnaps();
      unsubRecs();
    };
  }, [loadedFromLegacyCloud, authReady, authUser, activeFranchiseId]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in with Google. Manual & checkpoint Cloud Backup ready.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Sign-In failed.', 'error');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setLoadedFromLegacyCloud(false);
    setSyncState('idle');
    showToast('Signed out of Firebase. On-device saves remain available.', 'info');
  };

  const addTransaction = useCallback(
    (category: string, summary: string) => {
      setTransactions((prev) => [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, year, day: currentDay, category, summary },
        ...prev.slice(0, 149),
      ]);
    },
    [year, currentDay]
  );

  const handleCloudWriteError = useCallback(
    (err: unknown, silent = false) => {
      if (isQuotaExceededError(err) || isCloudQuotaPaused()) {
        setSyncState((prev) => {
          if (prev !== 'quota' && !silent) {
            showToast(
              'Daily Firestore write quota reached. Progress is auto-saved locally.',
              'warning'
            );
          }
          return 'quota';
        });
      } else {
        setSyncState('error');
        if (!silent) {
          showToast('Cloud sync failed. Changes remain active locally.', 'error');
        }
        console.error(err);
      }
    },
    [showToast]
  );

  // Local-First (IndexedDB) Auto-Save + Optional / Explicit Gzipped Cloud Backup
  const syncFranchiseSnapshotRef = useRef(0);
  const persistToCloud = useCallback(
    async (overrides?: Partial<{
      franchiseId: string;
      userTeamId: string;
      isNew: boolean;
      includePlayers: boolean;
      includeScheduleAndDraft: boolean;
      skipCloud: boolean;
      forceCloud: boolean;
      isSeasonMilestone: boolean;
      phase: GamePhase;
      year: number;
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
    }>) => {
      const targetUserTeamId = overrides?.userTeamId ?? userTeamId;
      const fid = overrides?.franchiseId ?? activeFranchiseId ?? `FRAN_${targetUserTeamId}_${Date.now()}`;
      const tList = overrides?.teams ?? teams;
      const uTeam = tList.find((t) => t.id === targetUserTeamId);
      const franchiseName = uTeam ? `${uTeam.city} ${uTeam.name} Dynasty` : `${targetUserTeamId} Dynasty`;

      const fullData = {
        franchiseId: fid,
        ownerId: authUser?.uid || 'local',
        name: franchiseName,
        userTeamId: targetUserTeamId,
        year: overrides?.year ?? year,
        phase: overrides?.phase ?? phase,
        currentDay: overrides?.currentDay ?? currentDay,
        currentPickIdx: overrides?.currentPickIdx ?? currentPickIdx,
        teams: tList,
        championsHistory: overrides?.championsHistory ?? championsHistory,
        transactions: overrides?.transactions ?? transactions,
        recentGames: overrides?.recentGames ?? recentGames,
        playoffResults: overrides?.playoffResults !== undefined ? overrides.playoffResults : playoffResults,
        players: overrides?.players ?? players,
        draftPool: overrides?.draftPool ?? draftPool,
        schedule: overrides?.schedule ?? schedule,
        draftPicks: overrides?.draftPicks ?? draftPicks,
        draftOrder: overrides?.draftOrder ?? draftOrder,
        draftHistory: overrides?.draftHistory ?? draftHistory,
        savedCards: overrides?.savedCards ?? savedCards,
        seasonSnapshots: overrides?.seasonSnapshots ?? seasonSnapshots,
        leagueRecords: overrides?.leagueRecords ?? leagueRecords,
      };

      const nowMs = Date.now();
      const localRecord: StoredFranchiseRecord = {
        ...fullData,
        playoffResults: fullData.playoffResults ?? null,
        savedCards: fullData.savedCards || [],
        seasonSnapshots: fullData.seasonSnapshots || [],
        leagueRecords: fullData.leagueRecords || [],
        savedAtMs: nowMs,
      };

      // Always write immediately to IndexedDB (zero cloud writes, offline-ready)
      await saveFranchiseToIndexedDb(localRecord);
      const updatedList = await listFranchisesFromIndexedDb();
      setLocalBackups(updatedList);

      const shouldWriteCloud =
        Boolean(authUser) &&
        !overrides?.skipCloud &&
        !isCloudQuotaPaused() &&
        (Boolean(overrides?.forceCloud) ||
          (cloudSyncMode === 'season' && Boolean(overrides?.isSeasonMilestone)));

      if (!shouldWriteCloud) {
        if (!overrides?.forceCloud) {
          setHasUnsyncedCloudChanges(true);
        }
        if (isCloudQuotaPaused()) {
          setSyncState('quota');
        }
        return;
      }

      const seq = ++syncFranchiseSnapshotRef.current;
      setSyncState('saving');
      try {
        const res = await saveFullFranchiseToCloud(fullData, {
          isNew: false,
          includePlayers: true,
          includeScheduleAndDraft: true,
        });
        await markFranchiseCloudSyncedInDb(fid, nowMs);
        setLocalBackups(await listFranchisesFromIndexedDb());
        if (seq === syncFranchiseSnapshotRef.current) {
          setSyncState('synced');
          setHasUnsyncedCloudChanges(false);
        }
        if (overrides?.forceCloud && res.compressedBytes > 0) {
          const kb = Math.max(1, Math.round(res.compressedBytes / 1024));
          showToast(`Cloud Backup complete (${kb} KB gzipped, 2 Firestore writes).`, 'success');
        }
      } catch (err) {
        setHasUnsyncedCloudChanges(true);
        handleCloudWriteError(err);
      }
    },
    [
      authUser,
      activeFranchiseId,
      cloudSyncMode,
      teams,
      userTeamId,
      year,
      phase,
      currentDay,
      currentPickIdx,
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
      savedCards,
      seasonSnapshots,
      leagueRecords,
      handleCloudWriteError,
      showToast,
    ]
  );

  const handleToggleSyncMode = () => {
    const next: CloudSyncMode = cloudSyncMode === 'manual' ? 'season' : 'manual';
    setCloudSyncMode(next);
    setCloudSyncModeState(next);
    showToast(
      next === 'manual'
        ? 'Cloud Sync set to Manual Only (0 automatic Firestore writes).'
        : 'Cloud Sync set to Season Checkpoints (1 compressed backup at Draft/Season End).',
      'info'
    );
  };

  const handleBackupToCloud = async () => {
    if (!authUser) {
      await handleSignIn();
      return;
    }
    if (isCloudQuotaPaused()) {
      await resetCloudQuotaPause();
    }
    await persistToCloud({
      forceCloud: true,
      includePlayers: true,
      includeScheduleAndDraft: true,
    });
  };

  const handleRetryCloudSync = async () => {
    if (!authUser || !activeFranchiseId) return;
    await resetCloudQuotaPause();
    setSyncState('saving');
    try {
      await persistToCloud({
        forceCloud: true,
        includePlayers: true,
        includeScheduleAndDraft: true,
      });
    } catch (err) {
      handleCloudWriteError(err);
    }
  };

  const handleExportCurrentFranchise = () => {
    const fid = activeFranchiseId ?? `FRAN_${userTeamId}_${Date.now()}`;
    const uTeam = teamMap[userTeamId];
    const franchiseName = uTeam ? `${uTeam.city} ${uTeam.name} Dynasty` : `${userTeamId} Dynasty`;
    exportFranchiseToJsonFile({
      franchiseId: fid,
      ownerId: authUser?.uid || 'local',
      name: franchiseName,
      userTeamId,
      year,
      phase,
      currentDay,
      currentPickIdx,
      teams,
      players,
      draftPool,
      schedule,
      draftPicks,
      draftOrder,
      draftHistory,
      playoffResults: playoffResults ?? null,
      championsHistory,
      transactions,
      recentGames,
      savedCards,
      seasonSnapshots,
      leagueRecords,
      savedAtMs: Date.now(),
    });
    showToast('Exported dynasty save file (.ddgm.json).', 'success');
  };

  const handleExportLocalFranchiseById = async (franchiseId: string) => {
    const rec = await loadFranchiseFromIndexedDb(franchiseId);
    if (!rec) {
      showToast('Could not locate on-device save to export.', 'error');
      return;
    }
    exportFranchiseToJsonFile(rec);
    showToast(`Exported ${rec.name} (.ddgm.json).`, 'success');
  };

  const handleImportSaveFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rec = await parseImportedFranchiseFile(file);
      await saveFranchiseToIndexedDb(rec);
      setLocalBackups(await listFranchisesFromIndexedDb());
      setUserTeamId(rec.userTeamId);
      setYear(rec.year);
      setPhase(rec.phase);
      setCurrentDay(rec.currentDay);
      setCurrentPickIdx(rec.currentPickIdx);
      setTeams(rec.teams);
      setPlayers(rec.players);
      setDraftPool(rec.draftPool);
      setSchedule(rec.schedule);
      setDraftPicks(rec.draftPicks);
      setDraftOrder(rec.draftOrder);
      setDraftHistory(rec.draftHistory);
      setPlayoffResults(rec.playoffResults);
      setChampionsHistory(rec.championsHistory);
      setTransactions(rec.transactions);
      setRecentGames(rec.recentGames);
      setSavedCards(rec.savedCards || []);
      setSeasonSnapshots(rec.seasonSnapshots || []);
      setLeagueRecords(rec.leagueRecords || []);
      setActiveFranchiseId(rec.franchiseId);
      setLoadedFromLegacyCloud(false);
      setHasUnsyncedCloudChanges(true);
      setSyncState(isCloudQuotaPaused() ? 'quota' : 'idle');
      setActiveTab(
        rec.phase === 'INAUGURAL_DRAFT' || rec.phase === 'ROOKIE_DRAFT'
          ? 'draft'
          : rec.phase === 'OFFSEASON_FA'
          ? 'offseason'
          : 'dashboard'
      );
      showToast(`Imported ${rec.name} (${rec.year} · Day ${rec.currentDay}).`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to import save file.', 'error');
    }
  };

  // Derived Lookups
  const teamMap = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teams]);

  const userTeam = teamMap[userTeamId];

  const playersByTeam = useMemo(() => {
    const map: Record<string, Player[]> = {};
    teams.forEach((t) => {
      map[t.id] = [];
    });
    const waivers: Player[] = [];
    players.forEach((p) => {
      if (p.teamId && map[p.teamId]) map[p.teamId].push(p);
      else waivers.push(p);
    });
    Object.keys(map).forEach((tid) => map[tid].sort((a, b) => b.ovr - a.ovr));
    waivers.sort((a, b) => b.ovr - a.ovr);
    return { byTeam: map, waivers };
  }, [players, teams]);

  const userCapSummary = useMemo(
    () => getTeamPayrollSummary(userTeam, playersByTeam.byTeam[userTeamId] || []),
    [userTeam, playersByTeam, userTeamId]
  );

  const todayUserMatchup = useMemo(() => {
    if (phase !== 'REGULAR_SEASON' || currentDay >= 162) return null;
    const dayGames = schedule[currentDay] || [];
    const pair = dayGames.find(([h, a]) => h === userTeamId || a === userTeamId);
    if (!pair) return null;
    const homeTeam = teamMap[pair[0]];
    const awayTeam = teamMap[pair[1]];
    if (!homeTeam || !awayTeam) return null;
    return { homeTeam, awayTeam };
  }, [phase, currentDay, schedule, userTeamId, teamMap]);

  // ==========================================================================
  // START NEW FRANCHISE OR RESUME FROM FIREBASE
  // ==========================================================================

  const startNewFranchise = async (chosenTeamId: string) => {
    resetPlayerCounter(1);
    const { teams: initTeams, draftPicks: initPicks } = createInitialLeague(2026);
    const pool = generateInitialPlayerPool();
    const sched = generateSeasonSchedule(initTeams);

    const shuffledTeamIds = [...initTeams.map((t) => t.id)].sort(() => Math.random() - 0.5);
    const order: DraftSlot[] = [];
    let pickCounter = 1;
    for (let r = 1; r <= 30; r++) {
      const roundOrder = r % 2 === 1 ? shuffledTeamIds : [...shuffledTeamIds].reverse();
      for (const tid of roundOrder) {
        order.push({
          pickNum: pickCounter++,
          round: r,
          teamId: tid,
          originalTeamId: tid,
        });
      }
    }

    const initTx: TransactionEntry[] = [
      {
        id: 'init-1',
        year: 2026,
        day: 0,
        category: 'LEAGUE',
        summary: '2026 Inaugural Fantasy Draft initialized with 1,344 players across 32 franchises.',
      },
    ];

    const newFranchiseId = `FRAN_${chosenTeamId}_${Date.now()}`;

    setUserTeamId(chosenTeamId);
    setYear(2026);
    setTeams(initTeams);
    setDraftPicks(initPicks);
    setSchedule(sched);
    setCurrentDay(0);
    setPlayers([]);
    setDraftPool(pool);
    setDraftOrder(order);
    setCurrentPickIdx(0);
    setDraftHistory([]);
    setPlayoffResults(null);
    setChampionsHistory([]);
    setRecentGames([]);
    setTransactions(initTx);
    setSavedCards([]);
    setSeasonSnapshots([]);
    setLeagueRecords([]);
    setPhase('INAUGURAL_DRAFT');
    setActiveTab('draft');
    setActiveFranchiseId(newFranchiseId);
    setLoadedFromLegacyCloud(false);
    setHasUnsyncedCloudChanges(true);

    // Save immediately to on-device IndexedDB (0 Firestore writes on creation)
    await persistToCloud({
      franchiseId: newFranchiseId,
      userTeamId: chosenTeamId,
      skipCloud: true,
      phase: 'INAUGURAL_DRAFT',
      year: 2026,
      currentDay: 0,
      currentPickIdx: 0,
      teams: initTeams,
      players: [],
      draftPool: pool,
      schedule: sched,
      draftPicks: initPicks,
      draftOrder: order,
      draftHistory: [],
      playoffResults: null,
      championsHistory: [],
      transactions: initTx,
      recentGames: [],
      savedCards: [],
      seasonSnapshots: [],
      leagueRecords: [],
    });
  };

  const resumeLocalBackup = async (franchiseId: string) => {
    const backup = await loadFranchiseFromIndexedDb(franchiseId);
    if (!backup) {
      showToast('On-device dynasty save not found.', 'error');
      return;
    }
    setUserTeamId(backup.userTeamId);
    setYear(backup.year);
    setPhase(backup.phase);
    setCurrentDay(backup.currentDay);
    setCurrentPickIdx(backup.currentPickIdx);
    setTeams(normalizeLoadedTeams(backup.teams || []));
    setPlayers(normalizeLoadedPlayers(backup.players || []));
    setDraftPool(normalizeLoadedPlayers(backup.draftPool || []));
    setSchedule(backup.schedule);
    setDraftPicks(backup.draftPicks);
    setDraftOrder(backup.draftOrder);
    setDraftHistory(backup.draftHistory);
    setPlayoffResults(backup.playoffResults);
    setChampionsHistory(backup.championsHistory);
    setTransactions(backup.transactions);
    setRecentGames(backup.recentGames);
    setSavedCards(backup.savedCards || []);
    setSeasonSnapshots(backup.seasonSnapshots || []);
    setLeagueRecords(backup.leagueRecords || []);
    setActiveFranchiseId(backup.franchiseId);
    setLoadedFromLegacyCloud(false);
    const unsynced = !backup.lastCloudSyncMs || backup.savedAtMs > backup.lastCloudSyncMs;
    setHasUnsyncedCloudChanges(unsynced);
    setSyncState(isCloudQuotaPaused() ? 'quota' : unsynced ? 'idle' : 'synced');
    setActiveTab(
      backup.phase === 'INAUGURAL_DRAFT' || backup.phase === 'ROOKIE_DRAFT'
        ? 'draft'
        : backup.phase === 'OFFSEASON_FA'
        ? 'offseason'
        : 'dashboard'
    );
    showToast(`Loaded on-device dynasty: ${backup.name} (${backup.year} · Day ${backup.currentDay}).`, 'info');
  };

  const resumeCloudFranchise = async (franchise: FranchiseSummary) => {
    if (!authUser) return;
    setLoadingFranchiseId(franchise.id);
    try {
      const localBackup = await loadFranchiseFromIndexedDb(franchise.id);
      const localIsAhead =
        localBackup &&
        (localBackup.year > franchise.year ||
          (localBackup.year === franchise.year && localBackup.currentDay > franchise.currentDay));

      if (localIsAhead && localBackup) {
        await resumeLocalBackup(franchise.id);
        showToast(
          `Resumed newer on-device save (${localBackup.year} · Day ${localBackup.currentDay}).`,
          'info'
        );
        return;
      }

      const chunks = await loadFranchiseChunksFromCloud(franchise.id, authUser.uid);
      const normTeams = normalizeLoadedTeams(franchise.teams || []);
      const normPlayers = normalizeLoadedPlayers(chunks.players);
      const normPool = normalizeLoadedPlayers(chunks.draftPool);

      setUserTeamId(franchise.userTeamId);
      setYear(franchise.year);
      setPhase(franchise.phase);
      setCurrentDay(franchise.currentDay);
      setCurrentPickIdx(franchise.currentPickIdx);
      setTeams(normTeams);
      setChampionsHistory(franchise.championsHistory || []);
      setTransactions(franchise.transactions || []);
      setRecentGames(franchise.recentGames || []);
      setPlayoffResults(franchise.playoffResults || null);

      setPlayers(normPlayers);
      setDraftPool(normPool);
      setSchedule(chunks.schedule);
      setDraftPicks(chunks.draftPicks);
      setDraftOrder(chunks.draftOrder);
      setDraftHistory(chunks.draftHistory);

      const isBundle = chunks.savedCards !== undefined || chunks.seasonSnapshots !== undefined;
      if (chunks.savedCards) setSavedCards(chunks.savedCards);
      if (chunks.seasonSnapshots) setSeasonSnapshots(chunks.seasonSnapshots);
      if (chunks.leagueRecords) setLeagueRecords(chunks.leagueRecords);
      setLoadedFromLegacyCloud(!isBundle);

      // Cache locally in IndexedDB so subsequent gameplay requires 0 cloud writes
      const nowMs = Date.now();
      await saveFranchiseToIndexedDb({
        franchiseId: franchise.id,
        ownerId: authUser.uid,
        name: franchise.name,
        userTeamId: franchise.userTeamId,
        year: franchise.year,
        phase: franchise.phase,
        currentDay: franchise.currentDay,
        currentPickIdx: franchise.currentPickIdx,
        teams: normTeams,
        players: normPlayers,
        draftPool: normPool,
        schedule: chunks.schedule,
        draftPicks: chunks.draftPicks,
        draftOrder: chunks.draftOrder,
        draftHistory: chunks.draftHistory,
        playoffResults: franchise.playoffResults || null,
        championsHistory: franchise.championsHistory || [],
        transactions: franchise.transactions || [],
        recentGames: franchise.recentGames || [],
        savedCards: chunks.savedCards || [],
        seasonSnapshots: chunks.seasonSnapshots || [],
        leagueRecords: chunks.leagueRecords || [],
        savedAtMs: nowMs,
        lastCloudSyncMs: nowMs,
      });
      setLocalBackups(await listFranchisesFromIndexedDb());

      setActiveFranchiseId(franchise.id);
      setHasUnsyncedCloudChanges(false);
      setSyncState(isCloudQuotaPaused() ? 'quota' : 'synced');
      setActiveTab(
        franchise.phase === 'INAUGURAL_DRAFT' || franchise.phase === 'ROOKIE_DRAFT'
          ? 'draft'
          : franchise.phase === 'OFFSEASON_FA'
          ? 'offseason'
          : 'dashboard'
      );
      showToast(`Loaded ${franchise.name} (${franchise.year} · Day ${franchise.currentDay}).`, 'success');
    } catch (err) {
      const localBackup = await loadFranchiseFromIndexedDb(franchise.id);
      if (localBackup) {
        await resumeLocalBackup(franchise.id);
        return;
      }
      showToast('Failed to load franchise from Firestore.', 'error');
      console.error(err);
    } finally {
      setLoadingFranchiseId(null);
    }
  };

  const handleDeleteCloudFranchise = async (franchiseId: string) => {
    try {
      await deleteFranchiseFromCloud(franchiseId);
      await deleteFranchiseFromIndexedDb(franchiseId);
      setLocalBackups(await listFranchisesFromIndexedDb());
      if (activeFranchiseId === franchiseId) {
        setActiveFranchiseId(null);
        setPhase('SETUP');
      }
      showToast('Saved franchise deleted.', 'info');
    } catch (err) {
      handleCloudWriteError(err);
    }
  };

  const handleDeleteLocalBackup = async (franchiseId: string) => {
    await deleteFranchiseFromIndexedDb(franchiseId);
    setLocalBackups(await listFranchisesFromIndexedDb());
    showToast('On-device dynasty removed.', 'info');
  };

  // ==========================================================================
  // DRAFT EXECUTION HELPERS
  // ==========================================================================

  const executeSingleDraftPick = useCallback(
    (
      chosenPlayerId: string | null,
      currentIdx: number,
      currentPool: Player[],
      currentPlayers: Player[],
      isRookieDraft: boolean
    ) => {
      const slot = draftOrder[currentIdx];
      if (!slot) return null;

      const slotTeam = teamMap[slot.teamId];
      const teamRoster = currentPlayers.filter((p) => p.teamId === slot.teamId);
      const teamSummary = getTeamPayrollSummary(slotTeam, teamRoster);

      let pickedPlayer: Player | null = null;
      if (chosenPlayerId) {
        const candidate = currentPool.find((p) => p.id === chosenPlayerId) || null;
        if (!candidate) return null;
        const cost = isRookieDraft
          ? getRookieContractSalary(slot.round)
          : getPlayerSalary(candidate);
        const reserve = isRookieDraft
          ? 0
          : roundMoney(Math.max(0, 30 - teamRoster.length - 1) * MIN_PLAYER_SALARY);
        if (roundMoney(teamSummary.totalPayroll + cost + reserve) > HARD_SALARY_CAP) {
          showToast(
            `Draft pick blocked: exceeds $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap (or leaves too little cap for remaining roster slots).`,
            'error'
          );
          return null;
        }
        pickedPlayer = candidate;
      } else {
        pickedPlayer = selectBestDraftPickForAI(currentPool, teamRoster, {
          team: slotTeam,
          isRookieDraft,
          round: slot.round,
          targetRosterSize: 30,
        });
      }

      // If AI cannot afford a Rookie Draft slot under $180M, forfeit/pass cleanly without violating cap
      if (!pickedPlayer) {
        return {
          nextIdx: currentIdx + 1,
          nextPool: currentPool,
          nextPlayers: currentPlayers,
          historyEntry: null as DraftHistoryEntry | null,
        };
      }

      const updatedPlayer: Player = isRookieDraft
        ? {
            ...pickedPlayer,
            teamId: slot.teamId,
            previousTeamId: slot.teamId,
            salary: getRookieContractSalary(slot.round),
            contractYears: ROOKIE_CONTRACT_YEARS,
          }
        : {
            ...pickedPlayer,
            teamId: slot.teamId,
            previousTeamId: slot.teamId,
          };

      const nextPool = currentPool.filter((p) => p.id !== pickedPlayer.id);
      const nextPlayers = [...currentPlayers, updatedPlayer];
      const historyEntry: DraftHistoryEntry = {
        ...slot,
        player: updatedPlayer,
      };

      return {
        nextIdx: currentIdx + 1,
        nextPool,
        nextPlayers,
        historyEntry,
      };
    },
    [draftOrder, teamMap, showToast]
  );

  const finishActiveDraft = useCallback(
    (finalPlayers: Player[], remainingPool: Player[], isRookie: boolean, nextHist: DraftHistoryEntry[]) => {
      const waiverPlayers = remainingPool.map((p) => ({
        ...p,
        teamId: null,
        salary: getPlayerSalary(p),
        contractYears: getPlayerContractYears(p),
      }));
      const mergedPlayers = [...finalPlayers, ...waiverPlayers];

      if (!isRookie) {
        const txEntry: TransactionEntry = {
          id: `draft-done-${Date.now()}`,
          year,
          day: 0,
          category: 'DRAFT',
          summary: `Inaugural 30-Round Draft complete under $180.0M cap. 960 players drafted; ${waiverPlayers.length} placed on Waiver Wire.`,
        };
        const updatedTx = [txEntry, ...transactions.slice(0, 148)];
        setPlayers(mergedPlayers);
        setDraftPool([]);
        setPhase('REGULAR_SEASON');
        setActiveTab('dashboard');
        setTransactions(updatedTx);
        showToast('Inaugural Draft Complete. Opening Day is ready.', 'success');
        void persistToCloud({
          isSeasonMilestone: true,
          phase: 'REGULAR_SEASON',
          includePlayers: true,
          includeScheduleAndDraft: true,
          players: mergedPlayers,
          draftPool: [],
          draftHistory: nextHist,
          currentPickIdx: draftOrder.length,
          transactions: updatedTx,
        });
      } else {
        const trimmedPlayers: Player[] = [];
        const userRoster: Player[] = [];
        const byT: Record<string, Player[]> = {};
        mergedPlayers.forEach((p) => {
          if (!p.teamId) {
            trimmedPlayers.push(p);
          } else {
            if (!byT[p.teamId]) byT[p.teamId] = [];
            byT[p.teamId].push(p);
          }
        });

        Object.entries(byT).forEach(([tid, roster]) => {
          if (tid === userTeamId) {
            userRoster.push(...roster);
          } else {
            roster.sort(
              (a, b) => b.ovr + (b.age <= 22 ? 6 : 0) - (a.ovr + (a.age <= 22 ? 6 : 0))
            );
            const keep = roster.slice(0, 30);
            const cut = roster.slice(30).map((p) => ({ ...p, teamId: null }));
            trimmedPlayers.push(...keep, ...cut);
          }
        });

        const finalCombined = [...trimmedPlayers, ...userRoster];
        const uSummary = getTeamPayrollSummary(teamMap[userTeamId], userRoster);
        const needsCuts = userRoster.length > 30 || uSummary.overCap;
        const nextPhase: GamePhase = needsCuts ? 'ROSTER_CUTS' : 'REGULAR_SEASON';
        const txEntry: TransactionEntry = {
          id: `rdraft-done-${Date.now()}`,
          year,
          day: 0,
          category: 'DRAFT',
          summary: `${year} Rookie Draft concluded (3-yr deals: $3.50M R1, $1.75M R2, $0.75M R3–R5). Remaining prospects added to Waiver Pool.`,
        };
        const updatedTx = [txEntry, ...transactions.slice(0, 148)];

        setPlayers(finalCombined);
        setDraftPool([]);
        setTransactions(updatedTx);
        setPhase(nextPhase);
        setActiveTab(nextPhase === 'ROSTER_CUTS' ? 'roster' : 'dashboard');

        if (nextPhase === 'ROSTER_CUTS') {
          showToast(
            `Rookie Draft complete. Ensure roster <= 30 (${userRoster.length}/30) and <= $180.0M (${formatMoney(uSummary.totalPayroll)}).`,
            'warning'
          );
        } else {
          showToast(`${year} Regular Season is ready.`, 'success');
        }

        void persistToCloud({
          isSeasonMilestone: true,
          phase: nextPhase,
          includePlayers: true,
          includeScheduleAndDraft: true,
          players: finalCombined,
          draftPool: [],
          draftHistory: nextHist,
          currentPickIdx: draftOrder.length,
          transactions: updatedTx,
        });
      }
    },
    [draftOrder.length, persistToCloud, showToast, teamMap, transactions, userTeamId, year]
  );

  const handleUserDraftSelect = (playerId: string) => {
    const slot = draftOrder[currentPickIdx];
    if (!slot || slot.teamId !== userTeamId) return;

    const isRookie = phase === 'ROOKIE_DRAFT';
    const res = executeSingleDraftPick(playerId, currentPickIdx, draftPool, players, isRookie);
    if (!res) return;

    const nextHist = res.historyEntry ? [res.historyEntry, ...draftHistory] : draftHistory;
    setDraftHistory(nextHist);
    if (res.nextIdx >= draftOrder.length) {
      finishActiveDraft(res.nextPlayers, res.nextPool, isRookie, nextHist);
    } else {
      setCurrentPickIdx(res.nextIdx);
      setDraftPool(res.nextPool);
      setPlayers(res.nextPlayers);
    }
  };

  const handlePassUserDraftPick = () => {
    const slot = draftOrder[currentPickIdx];
    if (!slot || slot.teamId !== userTeamId) return;
    const isRookie = phase === 'ROOKIE_DRAFT';
    const nextIdx = currentPickIdx + 1;
    addTransaction('DRAFT', `${userTeamId} passed Rd ${slot.round} Pick #${slot.pickNum} due to $180.0M Hard Cap.`);
    if (nextIdx >= draftOrder.length) {
      finishActiveDraft(players, draftPool, isRookie, draftHistory);
    } else {
      setCurrentPickIdx(nextIdx);
    }
  };

  const handleSimNextPick = () => {
    if (currentPickIdx >= draftOrder.length) return;
    const isRookie = phase === 'ROOKIE_DRAFT';
    const res = executeSingleDraftPick(null, currentPickIdx, draftPool, players, isRookie);
    if (!res) return;

    const nextHist = res.historyEntry ? [res.historyEntry, ...draftHistory] : draftHistory;
    setDraftHistory(nextHist);
    if (res.nextIdx >= draftOrder.length) {
      finishActiveDraft(res.nextPlayers, res.nextPool, isRookie, nextHist);
    } else {
      setCurrentPickIdx(res.nextIdx);
      setDraftPool(res.nextPool);
      setPlayers(res.nextPlayers);
    }
  };

  const handleSimToUserTurn = () => {
    const isRookie = phase === 'ROOKIE_DRAFT';
    let idx = currentPickIdx;
    let pool = draftPool;
    let plrs = players;
    const newHist: DraftHistoryEntry[] = [];

    if (idx < draftOrder.length && draftOrder[idx].teamId === userTeamId) {
      const first = executeSingleDraftPick(null, idx, pool, plrs, isRookie);
      if (first) {
        idx = first.nextIdx;
        pool = first.nextPool;
        plrs = first.nextPlayers;
        if (first.historyEntry) newHist.unshift(first.historyEntry);
      }
    }

    while (idx < draftOrder.length && draftOrder[idx].teamId !== userTeamId) {
      const step = executeSingleDraftPick(null, idx, pool, plrs, isRookie);
      if (!step) break;
      idx = step.nextIdx;
      pool = step.nextPool;
      plrs = step.nextPlayers;
      if (step.historyEntry) newHist.unshift(step.historyEntry);
    }

    const mergedHist = [...newHist, ...draftHistory];
    setDraftHistory(mergedHist);
    if (idx >= draftOrder.length) {
      finishActiveDraft(plrs, pool, isRookie, mergedHist);
    } else {
      setCurrentPickIdx(idx);
      setDraftPool(pool);
      setPlayers(plrs);
    }
  };

  const handleAutoDraftAll = () => {
    const isRookie = phase === 'ROOKIE_DRAFT';
    let idx = currentPickIdx;
    let pool = draftPool;
    let plrs = players;
    const newHist: DraftHistoryEntry[] = [];

    while (idx < draftOrder.length) {
      const step = executeSingleDraftPick(null, idx, pool, plrs, isRookie);
      if (!step) break;
      idx = step.nextIdx;
      pool = step.nextPool;
      plrs = step.nextPlayers;
      if (step.historyEntry) newHist.unshift(step.historyEntry);
    }

    const mergedHist = [...newHist, ...draftHistory];
    setDraftHistory(mergedHist);
    finishActiveDraft(plrs, pool, isRookie, mergedHist);
  };

  // ==========================================================================
  // REGULAR SEASON SIMULATION, TRENDS & RECORD BOOK UPDATES
  // ==========================================================================

  const applyDaysSimulation = (numDays: number, liveOverride?: LiveGameResult) => {
    if (phase !== 'REGULAR_SEASON' || currentDay >= 162) return;

    const targetDay = Math.min(162, currentDay + numDays);
    const workingTeams: Team[] = teams.map((t) => ({ ...t, last10: [...t.last10] }));
    const workingPlayers: Player[] = players.map((p) => ({
      ...p,
      seasonStats: { ...p.seasonStats },
    }));

    const tLookup: Record<string, Team> = {};
    workingTeams.forEach((t) => {
      tLookup[t.id] = t;
    });

    const pLookup: Record<string, Player> = {};
    const rosterLookup: Record<string, Player[]> = {};
    workingTeams.forEach((t) => {
      rosterLookup[t.id] = [];
    });
    workingPlayers.forEach((p) => {
      pLookup[p.id] = p;
      if (p.teamId && rosterLookup[p.teamId]) {
        rosterLookup[p.teamId].push(p);
      }
    });

    const userRecent: RecentGameEntry[] = [];
    const aiLogs: TransactionEntry[] = [];

    for (let d = currentDay; d < targetDay; d++) {
      const matchups = schedule[d] || [];
      for (const [homeId, awayId] of matchups) {
        const homeT = tLookup[homeId];
        const awayT = tLookup[awayId];
        if (!homeT || !awayT) continue;
        const useLive =
          liveOverride &&
          d === currentDay &&
          homeId === liveOverride.homeTeamId &&
          awayId === liveOverride.awayTeamId;
        const res = useLive
          ? liveOverride
          : simulateSingleGame(homeT, awayT, rosterLookup[homeId], rosterLookup[awayId], d);

        homeT.runsScored += res.homeRuns;
        homeT.runsAllowed += res.awayRuns;
        awayT.runsScored += res.awayRuns;
        awayT.runsAllowed += res.homeRuns;

        if (res.homeWon) {
          homeT.wins++;
          awayT.losses++;
          homeT.streak = homeT.streak >= 0 ? homeT.streak + 1 : 1;
          awayT.streak = awayT.streak <= 0 ? awayT.streak - 1 : -1;
          homeT.last10 = [...homeT.last10.slice(-9), 'W'];
          awayT.last10 = [...awayT.last10.slice(-9), 'L'];
        } else {
          awayT.wins++;
          homeT.losses++;
          awayT.streak = awayT.streak >= 0 ? awayT.streak + 1 : 1;
          homeT.streak = homeT.streak <= 0 ? homeT.streak - 1 : -1;
          awayT.last10 = [...awayT.last10.slice(-9), 'W'];
          homeT.last10 = [...homeT.last10.slice(-9), 'L'];
        }

        if (homeId === userTeamId || awayId === userTeamId) {
          userRecent.unshift({
            day: d + 1,
            homeId,
            awayId,
            homeRuns: res.homeRuns,
            awayRuns: res.awayRuns,
            userWon: (homeId === userTeamId && res.homeWon) || (awayId === userTeamId && !res.homeWon),
          });
        }

        for (const [pid, delta] of Object.entries(res.statDeltas)) {
          const plr = pLookup[pid];
          if (!plr) continue;
          const s = plr.seasonStats;
          for (const k of Object.keys(delta)) {
            s[k] = (s[k] || 0) + delta[k];
          }
        }
      }

      if (d > 10 && d < 145 && d % 12 === 0) {
        const waivers = workingPlayers.filter((p) => !p.teamId).sort((a, b) => b.ovr - a.ovr);
        if (waivers.length > 0) {
          const aiTeams = workingTeams.filter((t) => t.id !== userTeamId);
          const randomAI = aiTeams[Math.floor(Math.random() * aiTeams.length)];
          const aiRoster = rosterLookup[randomAI.id].sort((a, b) => a.ovr - b.ovr);
          const aiSummary = getTeamPayrollSummary(randomAI, aiRoster);
          const weakest = aiRoster[0];
          const topFA = waivers.find((cand) => {
            if (!weakest || cand.ovr <= weakest.ovr + 4) return false;
            const deadHit = computeReleaseDeadCap(weakest);
            const post = roundMoney(
              aiSummary.totalPayroll + getPlayerSalary(cand) - getPlayerSalary(weakest) + deadHit
            );
            return post <= HARD_SALARY_CAP;
          });
          if (topFA && weakest) {
            const deadHit = computeReleaseDeadCap(weakest);
            if (deadHit > 0) {
              randomAI.deadCap = roundMoney((randomAI.deadCap || 0) + deadHit);
            }
            topFA.teamId = randomAI.id;
            weakest.teamId = null;
            rosterLookup[randomAI.id] = [...aiRoster.slice(1), topFA];
            aiLogs.push({
              id: `ai-w-${d}-${randomAI.id}`,
              year,
              day: d + 1,
              category: 'WAIVER',
              summary: `${randomAI.city} ${randomAI.name} claimed ${topFA.position} ${topFA.name} (${topFA.ovr} OVR · ${formatMoney(getPlayerSalary(topFA))}) and waived ${weakest.name}.`,
            });
          }
        }
      }

      if (d > 30 && d < 115 && d % 25 === 0) {
        const aiTeams = workingTeams.filter((t) => t.id !== userTeamId);
        const t1 = aiTeams[Math.floor(Math.random() * aiTeams.length)];
        const t2 = aiTeams.find((t) => t.id !== t1.id && t.league !== t1.league);
        if (t1 && t2) {
          const r1 = rosterLookup[t1.id].sort((a, b) => b.ovr - a.ovr);
          const r2 = rosterLookup[t2.id].sort((a, b) => b.ovr - a.ovr);
          const p1 = r1[Math.floor(Math.random() * Math.min(8, r1.length)) + Math.min(4, Math.max(0, r1.length - 1))];
          const p2 = r2.find((cand) => {
            if (!p1 || cand.id === p1.id) return false;
            if (Math.abs(getPlayerTradeValue(cand) - getPlayerTradeValue(p1)) >= 85) return false;
            const s1 = getTeamPayrollSummary(t1, r1);
            const s2 = getTeamPayrollSummary(t2, r2);
            const post1 = roundMoney(s1.totalPayroll - getPlayerSalary(p1) + getPlayerSalary(cand));
            const post2 = roundMoney(s2.totalPayroll - getPlayerSalary(cand) + getPlayerSalary(p1));
            return post1 <= HARD_SALARY_CAP && post2 <= HARD_SALARY_CAP;
          });
          if (p1 && p2) {
            p1.teamId = t2.id;
            p2.teamId = t1.id;
            rosterLookup[t1.id] = rosterLookup[t1.id].filter((p) => p.id !== p1.id).concat(p2);
            rosterLookup[t2.id] = rosterLookup[t2.id].filter((p) => p.id !== p2.id).concat(p1);
            aiLogs.push({
              id: `ai-tr-${d}-${t1.id}`,
              year,
              day: d + 1,
              category: 'TRADE',
              summary: `TRADE: ${t1.id} acquires ${p2.position} ${p2.name} (${p2.ovr} · ${formatMoney(getPlayerSalary(p2))}) from ${t2.id} for ${p1.position} ${p1.name} (${p1.ovr} · ${formatMoney(getPlayerSalary(p1))}).`,
            });
          }
        }
      }
    }

    const updatedRecentGames = [...userRecent, ...recentGames].slice(0, 30);
    let updatedTransactions = aiLogs.length > 0 ? [...aiLogs, ...transactions].slice(0, 150) : transactions;
    let nextPhase: GamePhase = phase;
    let nextPlayoffs: PlayoffResults | null = playoffResults;
    let nextChamps = championsHistory;

    if (targetDay >= 162) {
      const pResults = simulatePlayoffs(workingTeams, rosterLookup);
      nextPlayoffs = pResults;
      const champTeam = workingTeams.find((t) => t.id === pResults.championId);
      if (champTeam) champTeam.championships += 1;

      nextChamps = [
        {
          year,
          championId: pResults.championId,
          championCity: pResults.championCity,
          championName: pResults.championName,
          championColor: champTeam?.color || '#1E3A8A',
          championAccent: champTeam?.accent || '#E2E8F0',
          runnerUpId: pResults.runnerUpId,
          runnerUpCity: pResults.runnerUpCity,
          runnerUpName: pResults.runnerUpName,
          score: pResults.rounds.worldSeries.score,
        },
        ...championsHistory,
      ];
      nextPhase = 'PLAYOFFS_COMPLETE';
      updatedTransactions = [
        {
          id: `po-${year}-${Date.now()}`,
          year,
          day: 162,
          category: 'PLAYOFFS',
          summary: `${year} World Series: ${pResults.championCity} ${pResults.championName} defeated ${pResults.runnerUpCity} ${pResults.runnerUpName} (${pResults.rounds.worldSeries.score}).`,
        },
        ...updatedTransactions,
      ].slice(0, 150);
      showToast(`${year} Regular Season & Playoffs Complete.`, 'success');
    }

    setTeams(workingTeams);
    setPlayers(workingPlayers);
    setCurrentDay(targetDay);
    setRecentGames(updatedRecentGames);
    setTransactions(updatedTransactions);
    setPlayoffResults(nextPlayoffs);
    setChampionsHistory(nextChamps);
    setPhase(nextPhase);

    // Build Trend Checkpoint Snapshot & Record Book updates
    const owner = authUser?.uid || 'local';
    const fid = activeFranchiseId || 'local';
    const snapPayload = buildSeasonSnapshotData({
      ownerId: owner,
      franchiseId: fid,
      year,
      day: targetDay,
      isSeasonEnd: targetDay >= 162,
      userTeamId,
      teams: workingTeams,
      players: workingPlayers,
      championTeamId: nextPlayoffs?.championId,
    });

    const recordUpdates = computeUpdatedRecords({
      ownerId: owner,
      franchiseId: fid,
      year,
      day: targetDay,
      teams: workingTeams,
      players: workingPlayers,
      userTeamId,
      existingRecords: leagueRecords,
    });

    // Update local state immediately for instant UI responsiveness
    const snapId = `SNAP_${year}_D${targetDay}${targetDay >= 162 ? '_FINAL' : ''}`;
    const nextSnapshots = [
      ...seasonSnapshots.filter((s) => s.id !== snapId),
      { id: snapId, ...snapPayload },
    ].sort((a, b) => a.year - b.year || a.day - b.day);
    setSeasonSnapshots(nextSnapshots);

    let nextRecords = leagueRecords;
    if (recordUpdates.length > 0) {
      const map = new Map(leagueRecords.map((r) => [r.recordKey, r]));
      recordUpdates.forEach((u) => {
        map.set(u.recordKey, { id: u.recordKey, ...u });
      });
      nextRecords = Array.from(map.values());
      setLeagueRecords(nextRecords);
    }

    // Keep saved cards synced with live local season stats
    const updatedCards = savedCards.map((card) => {
      const liveP = workingPlayers.find((p) => p.id === card.playerId);
      return liveP
        ? {
            ...card,
            teamId: liveP.teamId || 'FA',
            seasonStats: liveP.seasonStats,
            careerStats: liveP.careerStats,
          }
        : card;
    });
    if (updatedCards.length > 0) {
      setSavedCards(updatedCards);
    }

    const crossedSeasonEnd = targetDay >= 162;

    // Always persist full state instantaneously to IndexedDB; only cloud-sync at Season End if mode === 'season'
    void persistToCloud({
      isSeasonMilestone: crossedSeasonEnd,
      includePlayers: true,
      includeScheduleAndDraft: true,
      phase: nextPhase,
      currentDay: targetDay,
      teams: workingTeams,
      players: workingPlayers,
      recentGames: updatedRecentGames,
      transactions: updatedTransactions,
      playoffResults: nextPlayoffs,
      championsHistory: nextChamps,
      savedCards: updatedCards,
      seasonSnapshots: nextSnapshots,
      leagueRecords: nextRecords,
    });
  };

  const simulateDays = (numDays: number) => applyDaysSimulation(numDays);

  const commitLiveGameResult = (liveResult: LiveGameResult) => {
    applyDaysSimulation(1, liveResult);
    setActiveTab('dashboard');
    showToast(
      `Final committed: ${liveResult.awayTeamId} ${liveResult.awayRuns} @ ${liveResult.homeTeamId} ${liveResult.homeRuns}`,
      'success'
    );
  };

  // ==========================================================================
  // OFFSEASON PIPELINE: RETIREMENTS -> AGING -> RE-SIGN / FA -> ROOKIE DRAFT
  // ==========================================================================

  const advanceToOffseasonFreeAgency = () => {
    const nextYear = year + 1;
    const rollover = runOffseasonRollover({
      nextYear,
      teams,
      players,
      draftPicks,
      userTeamId,
    });

    const txEntry: TransactionEntry = {
      id: `offseason-${nextYear}-${Date.now()}`,
      year: nextYear,
      day: 0,
      category: 'OFFSEASON',
      summary: `Offseason ${nextYear}: ${rollover.retirements.length} retired, ${rollover.expiringUserCount} user contracts expired, ${rollover.aiReSignedCount} AI core re-signings completed.`,
    };
    const nextTx = [txEntry, ...transactions.slice(0, 148)];

    setYear(nextYear);
    setTeams(rollover.teams);
    setPlayers(rollover.players);
    setDraftPicks(rollover.draftPicks);
    setSchedule(rollover.schedule);
    setCurrentDay(0);
    setPlayoffResults(null);
    setRecentGames([]);
    setDraftOrder(rollover.orderedRookiePicks);
    setCurrentPickIdx(0);
    setDraftPool([]);
    setDraftHistory([]);
    setTransactions(nextTx);
    setPhase('OFFSEASON_FA');
    setActiveTab('offseason');
    setRetirementsSummary({
      year: nextYear,
      retirements: rollover.retirements,
      expiringUserCount: rollover.expiringUserCount,
      aiReSignedCount: rollover.aiReSignedCount,
    });
    showToast(`${nextYear} Offseason & Free Agency underway.`, 'info');

    void persistToCloud({
      isSeasonMilestone: true,
      year: nextYear,
      phase: 'OFFSEASON_FA',
      includePlayers: true,
      includeScheduleAndDraft: true,
      currentDay: 0,
      currentPickIdx: 0,
      teams: rollover.teams,
      players: rollover.players,
      draftPool: [],
      schedule: rollover.schedule,
      draftPicks: rollover.draftPicks,
      draftOrder: rollover.orderedRookiePicks,
      draftHistory: [],
      playoffResults: null,
      recentGames: [],
      transactions: nextTx,
    });
  };

  const proceedFromOffseasonFAToDraft = () => {
    const aiFA = runAIOffseasonFreeAgency({
      teams,
      players,
      userTeamId,
      draftOrder,
    });
    const rookieClass = generateRookieClass(year);
    const faLogs: TransactionEntry[] = aiFA.signings.slice(0, 8).map((s, idx) => ({
      id: `fa-ai-${year}-${Date.now()}-${idx}`,
      year,
      day: 0,
      category: 'SIGNING',
      summary: s,
    }));
    const draftNotice: TransactionEntry = {
      id: `rdraft-start-${year}-${Date.now()}`,
      year,
      day: 0,
      category: 'DRAFT',
      summary: `${year} 5-Round Rookie Draft initialized (#1 pick: ${draftOrder[0]?.teamId || 'TBD'}). Rookie slots: $3.50M R1, $1.75M R2, $0.75M R3–R5 (3 yrs).`,
    };
    const nextTx = [draftNotice, ...faLogs, ...transactions].slice(0, 150);

    setPlayers(aiFA.players);
    setDraftPool(rookieClass);
    setCurrentPickIdx(0);
    setDraftHistory([]);
    setTransactions(nextTx);
    setPhase('ROOKIE_DRAFT');
    setActiveTab('draft');
    showToast(`${year} Rookie Draft is on the clock.`, 'success');

    void persistToCloud({
      phase: 'ROOKIE_DRAFT',
      includePlayers: true,
      includeScheduleAndDraft: true,
      currentPickIdx: 0,
      players: aiFA.players,
      draftPool: rookieClass,
      draftHistory: [],
      transactions: nextTx,
    });
  };

  // ==========================================================================
  // FREE AGENCY, WAIVERS, EXTENSIONS, RELEASES & TRADES (STRICT $180M CAP)
  // ==========================================================================

  const handleSignOffseasonFA = (playerId: string, contractYears: number) => {
    const userRoster = playersByTeam.byTeam[userTeamId] || [];
    if (userRoster.length >= 30) {
      showToast('Roster is full (30/30). Release a player first.', 'error');
      return;
    }
    const target = players.find((p) => p.id === playerId && !p.teamId);
    if (!target) return;

    const offer = calculateExtensionOffer(target, contractYears);
    const postPayroll = roundMoney(userCapSummary.totalPayroll + offer.salary);
    if (postPayroll > HARD_SALARY_CAP) {
      showToast(
        `Signing blocked: ${formatMoney(postPayroll)} exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`,
        'error'
      );
      return;
    }

    const wasExpiring = target.previousTeamId === userTeamId;
    const nextPlayers = players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            teamId: userTeamId,
            previousTeamId: userTeamId,
            salary: offer.salary,
            contractYears: offer.years,
          }
        : p
    );

    const msg = `${userTeamId} ${wasExpiring ? 're-signed' : 'signed FA'} ${target.position} ${target.name} (${target.ovr} OVR) to a ${offer.years}-yr, ${formatMoney(offer.salary)}/yr deal.`;
    const nextTx = [
      { id: `fa-${Date.now()}`, year, day: currentDay, category: 'SIGNING', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setPlayers(nextPlayers);
    setTransactions(nextTx);
    showToast(msg, 'success');
    void persistToCloud({
      includePlayers: true,
      includeScheduleAndDraft: false,
      players: nextPlayers,
      transactions: nextTx,
    });
  };

  const handleExtendPlayer = (playerId: string, contractYears: number) => {
    const target = players.find((p) => p.id === playerId && p.teamId === userTeamId);
    if (!target) return;

    const offer = calculateExtensionOffer(target, contractYears);
    const postPayroll = roundMoney(
      userCapSummary.totalPayroll - getPlayerSalary(target) + offer.salary
    );
    if (postPayroll > HARD_SALARY_CAP) {
      showToast(
        `Extension blocked: ${formatMoney(postPayroll)} exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`,
        'error'
      );
      return;
    }

    const nextPlayers = players.map((p) =>
      p.id === playerId
        ? { ...p, salary: offer.salary, contractYears: offer.years }
        : p
    );
    const msg = `${userTeamId} extended ${target.position} ${target.name} (${offer.years} yrs · ${formatMoney(offer.salary)}/yr).`;
    const nextTx = [
      { id: `ext-${Date.now()}`, year, day: currentDay, category: 'CONTRACT', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setPlayers(nextPlayers);
    setTransactions(nextTx);
    showToast(msg, 'success');
    void persistToCloud({
      includePlayers: true,
      includeScheduleAndDraft: false,
      players: nextPlayers,
      transactions: nextTx,
    });
  };

  const handleWaiverClaimAndDrop = (claimPlayerId: string, dropPlayerId: string | null) => {
    const userRoster = playersByTeam.byTeam[userTeamId] || [];
    const claimPlr = players.find((p) => p.id === claimPlayerId && !p.teamId);
    if (!claimPlr) return;

    if (userRoster.length >= 30 && !dropPlayerId) {
      showToast('Your 30-man roster is full. Select a player to release.', 'error');
      return;
    }

    const dropPlr = dropPlayerId
      ? players.find((p) => p.id === dropPlayerId && p.teamId === userTeamId)
      : null;

    const claimSal = getPlayerSalary(claimPlr);
    const dropSal = dropPlr ? getPlayerSalary(dropPlr) : 0;
    const deadHit = dropPlr ? computeReleaseDeadCap(dropPlr) : 0;
    const postPayroll = roundMoney(userCapSummary.totalPayroll + claimSal - dropSal + deadHit);

    if (postPayroll > HARD_SALARY_CAP) {
      showToast(
        `Waiver claim blocked: post-claim payroll (${formatMoney(postPayroll)}) exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`,
        'error'
      );
      return;
    }

    const nextTeams =
      deadHit > 0
        ? teams.map((t) =>
            t.id === userTeamId
              ? { ...t, deadCap: roundMoney((t.deadCap || 0) + deadHit) }
              : t
          )
        : teams;

    const nextPlayers = players.map((p) => {
      if (p.id === claimPlayerId) return { ...p, teamId: userTeamId, previousTeamId: userTeamId };
      if (dropPlr && p.id === dropPlr.id) return { ...p, teamId: null };
      return p;
    });

    const msg = dropPlr
      ? `${userTeamId} claimed ${claimPlr.position} ${claimPlr.name} (${formatMoney(claimSal)}) and waived ${dropPlr.name}${deadHit > 0 ? ` (+${formatMoney(deadHit)} dead cap)` : ''}.`
      : `${userTeamId} signed ${claimPlr.position} ${claimPlr.name} (${formatMoney(claimSal)}) from waivers.`;
    const nextTx = [
      { id: `wv-${Date.now()}`, year, day: currentDay, category: 'WAIVER', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setTeams(nextTeams);
    setPlayers(nextPlayers);
    setTransactions(nextTx);
    showToast(msg, 'success');
    void persistToCloud({
      includePlayers: true,
      includeScheduleAndDraft: false,
      teams: nextTeams,
      players: nextPlayers,
      transactions: nextTx,
    });
  };

  const handleReleasePlayer = (dropPlayerId: string) => {
    const dropPlr = players.find((p) => p.id === dropPlayerId && p.teamId === userTeamId);
    if (!dropPlr) return;

    const deadHit = computeReleaseDeadCap(dropPlr);
    const nextTeams =
      deadHit > 0
        ? teams.map((t) =>
            t.id === userTeamId
              ? { ...t, deadCap: roundMoney((t.deadCap || 0) + deadHit) }
              : t
          )
        : teams;

    const nextPlayers = players.map((p) => (p.id === dropPlayerId ? { ...p, teamId: null } : p));
    const msg = `${userTeamId} released ${dropPlr.position} ${dropPlr.name} (${dropPlr.ovr}) to the Waiver Pool${
      deadHit > 0 ? ` — ${formatMoney(deadHit)} added to Dead Cap` : ''
    }.`;
    const nextTx = [
      { id: `rel-${Date.now()}`, year, day: currentDay, category: 'WAIVER', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setTeams(nextTeams);
    setPlayers(nextPlayers);
    setTransactions(nextTx);
    showToast(
      deadHit > 0
        ? `Released ${dropPlr.name} (+${formatMoney(deadHit)} Dead Cap).`
        : `Released ${dropPlr.name} to waivers.`,
      'info'
    );
    void persistToCloud({
      includePlayers: true,
      includeScheduleAndDraft: false,
      teams: nextTeams,
      players: nextPlayers,
      transactions: nextTx,
    });
  };

  const confirmRosterCutsComplete = () => {
    const userRoster = playersByTeam.byTeam[userTeamId] || [];
    if (userRoster.length > 30) {
      showToast(`Release ${userRoster.length - 30} more player(s) to reach the 30-man limit.`, 'error');
      return;
    }
    if (userCapSummary.overCap) {
      showToast(
        `Payroll (${formatMoney(userCapSummary.totalPayroll)}) exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap. Release salary first.`,
        'error'
      );
      return;
    }
    setPhase('REGULAR_SEASON');
    setActiveTab('dashboard');
    showToast(`30-man roster finalized for ${year}.`, 'success');
    void persistToCloud({
      phase: 'REGULAR_SEASON',
      includePlayers: false,
      includeScheduleAndDraft: false,
    });
  };

  const executeTrade = (
    partnerTeamId: string,
    userPlayerIds: string[],
    userPickIds: string[],
    aiPlayerIds: string[],
    aiPickIds: string[]
  ): boolean => {
    const userRoster = playersByTeam.byTeam[userTeamId] || [];
    const aiRoster = playersByTeam.byTeam[partnerTeamId] || [];

    const userSendPlayers = userRoster.filter((p) => userPlayerIds.includes(p.id));
    const userSendPicks = draftPicks.filter((pk) => userPickIds.includes(pk.id));
    const aiSendPlayers = aiRoster.filter((p) => aiPlayerIds.includes(p.id));
    const aiSendPicks = draftPicks.filter((pk) => aiPickIds.includes(pk.id));

    const evalRes = evaluateTradeProposal({
      userTeam,
      partnerTeam: teamMap[partnerTeamId],
      userRoster,
      partnerRoster: aiRoster,
      userSendPlayers,
      userSendPicks,
      aiSendPlayers,
      aiSendPicks,
      teams,
      year,
    });

    if (evalRes.capBlocked || evalRes.rosterBlocked) {
      showToast(evalRes.capBlockReason || 'Trade violates cap or 30-man roster limit.', 'error');
      return false;
    }

    const nextPlayers = players.map((p) => {
      if (userPlayerIds.includes(p.id)) return { ...p, teamId: partnerTeamId, previousTeamId: partnerTeamId };
      if (aiPlayerIds.includes(p.id)) return { ...p, teamId: userTeamId, previousTeamId: userTeamId };
      return p;
    });

    const nextPicks = draftPicks.map((pk) => {
      if (userPickIds.includes(pk.id)) return { ...pk, ownerTeamId: partnerTeamId };
      if (aiPickIds.includes(pk.id)) return { ...pk, ownerTeamId: userTeamId };
      return pk;
    });

    const uAssets = [
      ...userPlayerIds.map((id) => players.find((p) => p.id === id)?.name),
      ...userPickIds.map((id) => {
        const pk = draftPicks.find((x) => x.id === id);
        return pk ? `${pk.year} Rd ${pk.round} (${pk.originalTeamId})` : '';
      }),
    ].filter(Boolean);

    const aAssets = [
      ...aiPlayerIds.map((id) => players.find((p) => p.id === id)?.name),
      ...aiPickIds.map((id) => {
        const pk = draftPicks.find((x) => x.id === id);
        return pk ? `${pk.year} Rd ${pk.round} (${pk.originalTeamId})` : '';
      }),
    ].filter(Boolean);

    const msg = `TRADE: ${userTeamId} receives [${aAssets.join(', ')}] from ${partnerTeamId} for [${uAssets.join(', ')}].`;
    const nextTx = [
      { id: `tr-${Date.now()}`, year, day: currentDay, category: 'TRADE', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setPlayers(nextPlayers);
    setDraftPicks(nextPicks);
    setTransactions(nextTx);
    showToast(`Trade completed with ${teamMap[partnerTeamId]?.city} ${teamMap[partnerTeamId]?.name}.`, 'success');
    void persistToCloud({
      includePlayers: userPlayerIds.length > 0 || aiPlayerIds.length > 0,
      includeScheduleAndDraft: userPickIds.length > 0 || aiPickIds.length > 0,
      players: nextPlayers,
      draftPicks: nextPicks,
      transactions: nextTx,
    });
    return true;
  };

  // ==========================================================================
  // PLAYER CARD VAULT & CUSTOM CREATOR HANDLERS
  // ==========================================================================

  const handleSaveExistingPlayerCard = async (player: Player, theme: CardTheme, notes: string) => {
    const existing = savedCards.find((c) => c.playerId === player.id);
    const cardId = existing ? existing.id : `CARD_${player.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const cardData: Omit<SavedPlayerCard, 'createdAt' | 'updatedAt'> = {
      id: cardId,
      ownerId: authUser?.uid || 'local',
      franchiseId: activeFranchiseId || 'local',
      playerId: player.id,
      name: player.name,
      age: player.age,
      bats: player.bats,
      throws: player.throws,
      isPitcher: player.isPitcher,
      position: player.position,
      teamId: player.teamId || 'FA',
      ovr: player.ovr,
      potential: player.potential,
      power: player.power,
      speed: player.speed,
      glove: player.glove,
      velocity: player.velocity,
      control: player.control,
      finesse: player.finesse,
      cardTheme: theme,
      notes: notes || existing?.notes || 'Scouted franchise asset.',
      isCustom: existing?.isCustom ?? false,
      seasonStats: player.seasonStats,
      careerStats: player.careerStats,
      seasonHistory: existing?.seasonHistory || [],
    };

    const nextCards = [{ ...cardData }, ...savedCards.filter((c) => c.id !== cardId)];
    setSavedCards(nextCards);
    void persistToCloud({ savedCards: nextCards });
    showToast(`Saved ${player.name} to On-Device Card Vault.`, 'success');
  };

  const handleCreateCustomCard = async (params: {
    name: string;
    age: number;
    bats: 'L' | 'R' | 'S';
    throws: 'L' | 'R';
    position: PlayerPosition;
    power: number;
    speed: number;
    glove: number;
    velocity: number;
    control: number;
    finesse: number;
    potential: number;
    cardTheme: CardTheme;
    notes: string;
    targetDestination: 'ROSTER' | 'WAIVER' | 'VAULT_ONLY';
  }) => {
    const isPitcher = params.position === 'SP' || params.position === 'RP';
    const ovr = calculateOverall({
      isPitcher,
      position: params.position,
      power: params.power,
      speed: params.speed,
      glove: params.glove,
      velocity: params.velocity,
      control: params.control,
      finesse: params.finesse,
    });

    const customSalary = calculateFairSalary(ovr, params.age, params.potential);
    if (
      params.targetDestination === 'ROSTER' &&
      roundMoney(userCapSummary.totalPayroll + customSalary) > HARD_SALARY_CAP
    ) {
      showToast(
        `Cannot add custom player to active roster: ${formatMoney(
          roundMoney(userCapSummary.totalPayroll + customSalary)
        )} exceeds the $${HARD_SALARY_CAP.toFixed(1)}M Hard Cap.`,
        'error'
      );
      return;
    }

    const newPlayerId = `PLR-CUST-${Date.now()}`;
    const cardId = `CARD-${Date.now()}`;
    const assignedTeamId = params.targetDestination === 'ROSTER' ? userTeamId : null;

    const newPlayer: Player = {
      id: newPlayerId,
      name: params.name,
      age: params.age,
      bats: params.bats,
      throws: params.throws,
      isPitcher,
      position: params.position,
      teamId: assignedTeamId,
      previousTeamId: assignedTeamId,
      ovr,
      potential: params.potential,
      salary: customSalary,
      contractYears: 3,
      ...(isPitcher
        ? { velocity: params.velocity, control: params.control, finesse: params.finesse }
        : { power: params.power, speed: params.speed, glove: params.glove }),
      seasonStats: createEmptySeasonStats(isPitcher),
      careerStats: createEmptySeasonStats(isPitcher),
      seasonHistory: [],
    };

    let nextPlayers = players;
    let nextTx = transactions;
    if (params.targetDestination !== 'VAULT_ONLY') {
      nextPlayers = [newPlayer, ...players];
      const msg =
        params.targetDestination === 'ROSTER'
          ? `Signed custom player ${newPlayer.position} ${newPlayer.name} (${ovr} OVR) to ${userTeamId}.`
          : `Added custom player ${newPlayer.position} ${newPlayer.name} (${ovr} OVR) to Waiver Pool.`;
      nextTx = [
        { id: `cust-${Date.now()}`, year, day: currentDay, category: 'SIGNING', summary: msg },
        ...transactions.slice(0, 148),
      ];
      setPlayers(nextPlayers);
      setTransactions(nextTx);
    }

    const cardPayload: Omit<SavedPlayerCard, 'createdAt' | 'updatedAt'> = {
      id: cardId,
      ownerId: authUser?.uid || 'local',
      franchiseId: activeFranchiseId || 'local',
      playerId: newPlayerId,
      name: params.name,
      age: params.age,
      bats: params.bats,
      throws: params.throws,
      isPitcher,
      position: params.position,
      teamId: assignedTeamId || 'FA',
      ovr,
      potential: params.potential,
      ...(isPitcher
        ? { velocity: params.velocity, control: params.control, finesse: params.finesse }
        : { power: params.power, speed: params.speed, glove: params.glove }),
      cardTheme: params.cardTheme,
      notes: params.notes,
      isCustom: true,
      seasonStats: newPlayer.seasonStats,
      careerStats: newPlayer.careerStats,
      seasonHistory: [],
    };

    const nextCards = [{ ...cardPayload }, ...savedCards];
    setSavedCards(nextCards);
    void persistToCloud({
      players: nextPlayers,
      transactions: nextTx,
      savedCards: nextCards,
    });
    showToast(`Created ${params.name} (${ovr} OVR) player card.`, 'success');
  };

  const handleUpdateCardTheme = async (card: SavedPlayerCard, theme: CardTheme) => {
    const nextCards = savedCards.map((c) => (c.id === card.id ? { ...c, cardTheme: theme } : c));
    setSavedCards(nextCards);
    void persistToCloud({ savedCards: nextCards });
  };

  const handleDeleteCard = async (cardId: string) => {
    const nextCards = savedCards.filter((c) => c.id !== cardId);
    setSavedCards(nextCards);
    void persistToCloud({ savedCards: nextCards });
    showToast('Removed player card from vault.', 'info');
  };

  // ==========================================================================
  // SETUP / FRANCHISE SELECTION & CLOUD RESUME VIEW
  // ==========================================================================

  if (phase === 'SETUP') {
    const selectedCfg = TEAM_CONFIGS.find((t) => t.id === userTeamId);
    return (
      <div className="min-h-screen bg-[#090D16] text-slate-100 p-4 sm:p-8">
        <input
          ref={importFileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportSaveFile}
          className="hidden"
        />
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Top Bar */}
          <header className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-800 pb-6">
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-sky-400">
                32-Team Baseball Front Office · On-Device IndexedDB + Optional Cloud Backup
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Diamond Dynasty GM
              </h1>
              <p className="text-slate-400 max-w-2xl text-sm">
                Draft from a 1,344-player universe, manage a strict $180M salary cap, and sim full multi-season dynasties locally on your device with zero cloud quota burn.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                Import Save (.json)
              </button>
              <button
                onClick={handleToggleSyncMode}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 transition cursor-pointer whitespace-nowrap"
                title="Control when compressed backups are sent to Firestore"
              >
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                Cloud Mode: {cloudSyncMode === 'manual' ? 'Manual (0 Auto Writes)' : 'Season Checkpoints'}
              </button>
              {authReady && !authUser && (
                <button
                  onClick={handleSignIn}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition cursor-pointer whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4 text-sky-400" />
                  Sign In for Cloud Backup
                </button>
              )}
              {authUser && (
                <div className="flex items-center gap-3 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300 truncate max-w-[160px]">{authUser.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="text-slate-400 hover:text-white cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <button
                onClick={() => void startNewFranchise(userTeamId)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                Start New Dynasty ({selectedCfg?.city} {selectedCfg?.id})
              </button>
            </div>
          </header>

          {syncState === 'quota' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-amber-100 space-y-1">
                  <div className="font-semibold">
                    Daily Firestore Write Quota Paused — Playing Seamlessly On-Device
                  </div>
                  <p className="text-amber-200/80 text-xs">
                    All gameplay now auto-saves to your device&apos;s IndexedDB (0 Firebase writes). Manual Cloud Backup resumes automatically after tomorrow&apos;s quota reset, or export a `.ddgm.json` file anytime.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={FIRESTORE_PRICING_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap"
                >
                  Spark Pricing <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={FIRESTORE_QUOTA_UPGRADE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold whitespace-nowrap"
                >
                  Upgrade Database <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* On-Device IndexedDB Dynasties (Primary Free Storage) */}
          {localBackups.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  On-Device Dynasties ({localBackups.length})
                </h2>
                <span className="text-xs text-slate-400">
                  Stored locally in IndexedDB · Instant, offline-ready, $0 server cost
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {localBackups.map((lb) => {
                  const cfg = TEAM_CONFIGS.find((t) => t.id === lb.userTeamId);
                  const hasCloud = cloudFranchises.some((cf) => cf.id === lb.franchiseId);
                  const needsBackup = !lb.lastCloudSyncMs || lb.savedAtMs > lb.lastCloudSyncMs;
                  return (
                    <div
                      key={lb.franchiseId}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamBadge team={cfg} size="lg" />
                          <div className="min-w-0">
                            <div className="font-bold text-white text-sm truncate">{lb.name}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5 tabular-nums">
                              {lb.year} · Day {lb.currentDay}/162 · {lb.wins}-{lb.losses}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {hasCloud
                                ? needsBackup
                                  ? 'Local ahead of Cloud Backup'
                                  : 'Backed up to Cloud'
                                : 'Device-only save'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void handleExportLocalFranchiseById(lb.franchiseId)}
                            title="Export .ddgm.json Save File"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => void handleDeleteLocalBackup(lb.franchiseId)}
                            aria-label={`Delete local ${lb.name}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => void resumeLocalBackup(lb.franchiseId)}
                        className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                      >
                        Resume Dynasty
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Saved Cloud Backups (Firestore) */}
          {authUser && cloudFranchises.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-sky-400" />
                  Cloud Backups ({cloudFranchises.length})
                </h2>
                <span className="text-xs text-slate-400">Cross-device compressed Firestore backups</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloudFranchises.map((fran) => {
                  const cfg = TEAM_CONFIGS.find((t) => t.id === fran.userTeamId);
                  const teamState = fran.teams?.find((t) => t.id === fran.userTeamId);
                  return (
                    <div
                      key={fran.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamBadge team={cfg} size="lg" />
                          <div className="min-w-0">
                            <div className="font-bold text-white text-sm truncate">{fran.name}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5 tabular-nums">
                              {fran.year} · Day {fran.currentDay}/162 · {teamState ? `${teamState.wins}-${teamState.losses}` : '0-0'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => void handleDeleteCloudFranchise(fran.id)}
                          aria-label={`Delete ${fran.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        disabled={loadingFranchiseId === fran.id}
                        onClick={() => void resumeCloudFranchise(fran)}
                        className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer"
                      >
                        {loadingFranchiseId === fran.id ? 'Decompressing Save...' : 'Restore from Cloud'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 32 Franchise Selector */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(['AL', 'NL'] as const).map((lg) => (
              <div key={lg} className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
                <h2 className="font-display text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-sky-400" />
                  {lg === 'AL' ? 'American League (16 Teams)' : 'National League (16 Teams)'}
                </h2>
                <div className="space-y-4">
                  {(['East', 'Central', 'West'] as const).map((div) => {
                    const divTeams = TEAM_CONFIGS.filter((t) => t.league === lg && t.division === div);
                    return (
                      <div key={div}>
                        <div className="text-xs font-semibold text-slate-400 mb-2">
                          {lg} {div} ({divTeams.length} Teams)
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {divTeams.map((t) => {
                            const selected = userTeamId === t.id;
                            return (
                              <button
                                key={t.id}
                                onClick={() => setUserTeamId(t.id)}
                                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition cursor-pointer ${
                                  selected
                                    ? 'bg-sky-500/15 border-sky-400'
                                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-600'
                                }`}
                              >
                                <TeamBadge team={t} />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white truncate">{t.city}</div>
                                  <div className="text-[11px] text-slate-400 truncate">{t.name}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // MAIN FRONT OFFICE SHELL
  // ==========================================================================

  const userRoster = playersByTeam.byTeam[userTeamId] || [];
  const waiverPool = playersByTeam.waivers || [];
  const isDraftPhase = phase === 'INAUGURAL_DRAFT' || phase === 'ROOKIE_DRAFT';
  const isOffseasonFA = phase === 'OFFSEASON_FA';

  const navItems = [
    ...(isOffseasonFA
      ? [{ id: 'offseason', label: 'Offseason FA & Cap', icon: Sparkles, disabled: false }]
      : []),
    { id: 'dashboard', label: 'Dashboard', icon: Activity, disabled: isDraftPhase },
    {
      id: 'live',
      label: 'Live Ballpark',
      icon: Tv,
      disabled: phase !== 'REGULAR_SEASON' || currentDay >= 162 || !todayUserMatchup,
    },
    { id: 'trends', label: 'Trends', icon: TrendingUp, disabled: isDraftPhase },
    { id: 'cards', label: `Player Cards (${savedCards.length})`, icon: IdCard, disabled: false },
    { id: 'roster', label: `Roster (${userRoster.length}/30)`, icon: Users, disabled: false },
    { id: 'standings', label: 'Standings & Records', icon: BarChart3, disabled: isDraftPhase },
    { id: 'waivers', label: `Waivers (${waiverPool.length})`, icon: UserPlus, disabled: isDraftPhase || isOffseasonFA },
    { id: 'trades', label: 'Trade Center', icon: ArrowLeftRight, disabled: isDraftPhase },
    { id: 'draft', label: isDraftPhase ? 'Draft Room' : 'Draft Capital', icon: ListOrdered, disabled: false },
    { id: 'log', label: 'Wire', icon: FileText, disabled: false },
  ];

  const isSelectedPlayerSaved = selectedPlayer
    ? savedCards.some((c) => c.playerId === selectedPlayer.id)
    : false;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Top Executive Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <TeamBadge team={userTeam} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-white text-lg truncate">
                  {userTeam?.city} {userTeam?.name}
                </span>
                <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                  {userTeam?.league} {userTeam?.division}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
                <span className="text-sky-400 font-semibold">{year}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-semibold">
                  {userTeam?.wins ?? 0}-{userTeam?.losses ?? 0}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {phase === 'INAUGURAL_DRAFT' && 'Inaugural Draft'}
                  {phase === 'OFFSEASON_FA' && 'Offseason FA'}
                  {phase === 'ROOKIE_DRAFT' && 'Rookie Draft'}
                  {phase === 'ROSTER_CUTS' && 'Roster Cuts'}
                  {phase === 'REGULAR_SEASON' && `Day ${currentDay}/162`}
                  {phase === 'PLAYOFFS_COMPLETE' && 'Playoffs Complete'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Payroll{' '}
                  <strong
                    className={
                      userCapSummary.overCap
                        ? 'text-rose-400'
                        : userCapSummary.underFloor
                        ? 'text-amber-300'
                        : 'text-white'
                    }
                  >
                    {formatMoney(userCapSummary.totalPayroll)}
                  </strong>
                  <span className="text-slate-500">/$180M</span>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Cap Space{' '}
                  <strong className={userCapSummary.capSpace < 5 ? 'text-amber-300' : 'text-emerald-400'}>
                    {formatMoney(userCapSummary.capSpace)}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Dead Cap{' '}
                  <strong className={userCapSummary.deadCap > 0 ? 'text-rose-300' : 'text-slate-300'}>
                    {formatMoney(userCapSummary.deadCap)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Simulation & Cloud Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {phase === 'REGULAR_SEASON' && currentDay < 162 && (
              <>
                <button
                  onClick={() => simulateDays(1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Sim Game
                </button>
                <button
                  onClick={() => simulateDays(7)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer whitespace-nowrap"
                >
                  <FastForward className="w-3.5 h-3.5 text-sky-400" /> Sim Week
                </button>
                <button
                  onClick={() => simulateDays(30)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer whitespace-nowrap"
                >
                  <SkipForward className="w-3.5 h-3.5 text-indigo-400" /> Sim Month
                </button>
                <button
                  onClick={() => simulateDays(162 - currentDay)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                >
                  <Trophy className="w-3.5 h-3.5" /> Sim Season
                </button>
              </>
            )}

            {phase === 'PLAYOFFS_COMPLETE' && (
              <button
                onClick={advanceToOffseasonFreeAgency}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" /> Start {year + 1} Offseason
              </button>
            )}

            {phase === 'OFFSEASON_FA' && (
              <button
                onClick={proceedFromOffseasonFAToDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" /> Start {year} Rookie Draft
              </button>
            )}

            {phase === 'ROSTER_CUTS' && (
              <button
                onClick={confirmRosterCutsComplete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" /> Finalize Roster ({userRoster.length}/30)
              </button>
            )}

            <button
              onClick={handleExportCurrentFranchise}
              title="Export Dynasty Save (.ddgm.json)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Export
            </button>

            {authUser ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void handleBackupToCloud()}
                  disabled={syncState === 'saving'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                    syncState === 'quota'
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                      : hasUnsyncedCloudChanges
                      ? 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-200'
                      : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                  title="Send single compressed gzip backup to Firestore (~50KB)"
                >
                  <Save className="w-3.5 h-3.5 text-sky-400" />
                  {syncState === 'saving'
                    ? 'Backing Up...'
                    : syncState === 'quota'
                    ? 'On-Device Saved (Retry Cloud)'
                    : hasUnsyncedCloudChanges
                    ? 'Backup to Cloud'
                    : 'Cloud Backed Up'}
                </button>
                <button
                  onClick={handleToggleSyncMode}
                  title="Toggle Manual (0 auto writes) vs Season Checkpoints"
                  className="px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  {cloudSyncMode === 'manual' ? 'Manual' : 'Season'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-xs font-semibold text-sky-300 transition cursor-pointer whitespace-nowrap"
                title="Progress auto-saves on this device. Sign in for optional compressed Cloud Backup."
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                On-Device Saved · Cloud Backup
              </button>
            )}

            <button
              onClick={() => setPhase('SETUP')}
              title="Franchise Switcher & Setup"
              className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/70 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-800/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                disabled={item.disabled}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition cursor-pointer ${
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed border-transparent text-slate-500'
                    : active
                    ? 'border-sky-400 text-sky-400 bg-sky-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Live League Wire */}
      {transactions.length > 0 && (
        <div className="bg-slate-900/50 border-b border-slate-800/80 py-1.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-3 text-xs overflow-hidden">
            <span className="font-mono font-bold text-sky-400 text-[11px] shrink-0">WIRE</span>
            <span className="text-slate-300 truncate">{transactions[0].summary}</span>
          </div>
        </div>
      )}

      {/* Quota Exceeded Non-Blocking Notice */}
      {syncState === 'quota' && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Free daily Firestore write quota reached (resets tomorrow). Changes auto-save locally so your dynasty continues uninterrupted.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={FIRESTORE_PRICING_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 whitespace-nowrap"
              >
                Spark Pricing <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={FIRESTORE_QUOTA_UPGRADE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap"
              >
                Upgrade <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => void handleRetryCloudSync()}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer whitespace-nowrap"
              >
                Retry Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 ${
              toastMsg.type === 'error'
                ? 'text-rose-400'
                : toastMsg.type === 'warning'
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          />
          <span className="text-xs sm:text-sm font-medium">{toastMsg.text}</span>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'offseason' && isOffseasonFA && (
          <OffseasonFreeAgencyView
            year={year}
            userTeam={userTeam}
            teams={teams}
            players={players}
            userRoster={userRoster}
            freeAgents={waiverPool}
            draftOrder={draftOrder}
            onSignFreeAgent={handleSignOffseasonFA}
            onReleasePlayer={handleReleasePlayer}
            onProceedToDraft={proceedFromOffseasonFAToDraft}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            year={year}
            phase={phase}
            currentDay={currentDay}
            userTeam={userTeam}
            userRoster={userRoster}
            teams={teams}
            teamMap={teamMap}
            recentGames={recentGames}
            transactions={transactions}
            playoffResults={playoffResults}
            draftPicks={draftPicks}
            snapshots={seasonSnapshots}
            records={leagueRecords}
            onAdvanceOffseason={advanceToOffseasonFreeAgency}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
            onNavigate={setActiveTab}
            onPlayLiveGame={todayUserMatchup ? () => setActiveTab('live') : undefined}
            nextMatchupLabel={
              todayUserMatchup
                ? `Play Live · ${todayUserMatchup.awayTeam.id} @ ${todayUserMatchup.homeTeam.id}`
                : undefined
            }
          />
        )}

        {activeTab === 'live' && phase === 'REGULAR_SEASON' && todayUserMatchup && (
          <LiveGameCanvas
            key={`live-${year}-d${currentDay}-${todayUserMatchup.homeTeam.id}`}
            year={year}
            currentDay={currentDay}
            homeTeam={todayUserMatchup.homeTeam}
            awayTeam={todayUserMatchup.awayTeam}
            userTeamId={userTeamId}
            homeRoster={playersByTeam.byTeam[todayUserMatchup.homeTeam.id] || []}
            awayRoster={playersByTeam.byTeam[todayUserMatchup.awayTeam.id] || []}
            onCompleteGame={commitLiveGameResult}
            onExit={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'trends' && (
          <TrendsDashboardView
            year={year}
            currentDay={currentDay}
            userTeam={userTeam}
            teams={teams}
            snapshots={seasonSnapshots}
            championsHistory={championsHistory}
            canSaveToCloud={Boolean(authUser && activeFranchiseId)}
          />
        )}

        {activeTab === 'cards' && (
          <PlayerCardStudio
            savedCards={savedCards}
            teamMap={teamMap}
            userTeam={userTeam}
            userRosterCount={userRoster.length}
            canSaveToCloud={Boolean(authUser && activeFranchiseId)}
            onCreateCustomCard={handleCreateCustomCard}
            onDeleteCard={handleDeleteCard}
            onUpdateCardTheme={handleUpdateCardTheme}
          />
        )}

        {activeTab === 'roster' && (
          <RosterView
            userTeam={userTeam}
            userRoster={userRoster}
            phase={phase}
            onReleasePlayer={handleReleasePlayer}
            onExtendPlayer={handleExtendPlayer}
            onConfirmCuts={confirmRosterCutsComplete}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'standings' && (
          <StandingsAndRecordsView
            teams={teams}
            players={players}
            teamMap={teamMap}
            userTeamId={userTeamId}
            currentDay={currentDay}
            records={leagueRecords}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'waivers' && (
          <WaiverPoolView
            waiverPool={waiverPool}
            userTeam={userTeam}
            userRoster={userRoster}
            onClaimAndDrop={handleWaiverClaimAndDrop}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'trades' && (
          <TradeCenterView
            year={year}
            userTeam={userTeam}
            teams={teams}
            teamMap={teamMap}
            playersByTeam={playersByTeam.byTeam}
            draftPicks={draftPicks}
            onExecuteTrade={executeTrade}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'draft' && (
          <DraftRoomView
            year={year}
            phase={phase}
            userTeamId={userTeamId}
            userTeam={userTeam}
            teamMap={teamMap}
            draftOrder={draftOrder}
            currentPickIdx={currentPickIdx}
            draftPool={draftPool}
            draftHistory={draftHistory}
            userRoster={userRoster}
            draftPicks={draftPicks}
            onUserPick={handleUserDraftSelect}
            onPassPick={handlePassUserDraftPick}
            onSimNext={handleSimNextPick}
            onSimToUser={handleSimToUserTurn}
            onAutoDraftAll={handleAutoDraftAll}
            onSelectPlayer={(p) => setSelectedPlayer(p)}
          />
        )}

        {activeTab === 'log' && (
          <TransactionsLogView transactions={transactions} championsHistory={championsHistory} />
        )}
      </main>

      {/* Offseason Retirements Summary Modal */}
      {retirementsSummary && (
        <RetirementsModal
          year={retirementsSummary.year}
          retirements={retirementsSummary.retirements}
          teamMap={teamMap}
          expiringUserCount={retirementsSummary.expiringUserCount}
          aiReSignedCount={retirementsSummary.aiReSignedCount}
          onClose={() => setRetirementsSummary(null)}
        />
      )}

      {/* Dynamic Player Scouting Card Modal */}
      {selectedPlayer && (
        <PlayerCardModal
          player={selectedPlayer}
          team={selectedPlayer.teamId ? teamMap[selectedPlayer.teamId] : null}
          isSavedAlready={isSelectedPlayerSaved}
          canSaveToCloud={Boolean(authUser && activeFranchiseId)}
          onSaveCard={handleSaveExistingPlayerCard}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
