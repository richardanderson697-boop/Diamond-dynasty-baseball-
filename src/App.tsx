import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Activity,
  ArrowLeftRight,
  BarChart3,
  Check,
  Cloud,
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
  calculateOverall,
  clamp,
  computeUpdatedRecords,
  createEmptySeasonStats,
  createInitialLeague,
  generateInitialPlayerPool,
  generateRookieClass,
  generateSeasonSchedule,
  getDraftPickTradeValue,
  getPlayerTradeValue,
  resetPlayerCounter,
  ScheduleDay,
  selectBestDraftPickForAI,
  simulatePlayoffs,
  simulateSingleGame,
  TEAM_CONFIGS,
} from './engine/baseballEngine';
import {
  deleteFranchiseFromCloud,
  deleteLocalFranchiseBackup,
  deleteSavedPlayerCard,
  isCloudQuotaPaused,
  listLocalFranchiseBackups,
  loadFranchiseChunksFromCloud,
  loadLocalFranchiseBackup,
  LocalBackupMeta,
  recordSeasonSnapshot,
  resetCloudQuotaPause,
  saveFullFranchiseToCloud,
  saveLocalFranchiseBackup,
  subscribeToFranchises,
  subscribeToLeagueRecords,
  subscribeToSavedPlayers,
  subscribeToSeasonSnapshots,
  upsertLeagueRecords,
  upsertSavedPlayerCard,
} from './services/firestoreService';
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

export default function App() {
  // Firebase Auth State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Cloud Franchise Registry & Sync State
  const [cloudFranchises, setCloudFranchises] = useState<FranchiseSummary[]>([]);
  const [localBackups, setLocalBackups] = useState<LocalBackupMeta[]>(() => listLocalFranchiseBackups());
  const [activeFranchiseId, setActiveFranchiseId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'synced' | 'quota' | 'error'>(() =>
    isCloudQuotaPaused() ? 'quota' : 'idle'
  );
  const [loadingFranchiseId, setLoadingFranchiseId] = useState<string | null>(null);

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
  const [toastMsg, setToastMsg] = useState<{ text: string; type: string; id: number } | null>(null);

  const showToast = useCallback((text: string, type = 'info') => {
    setToastMsg({ text, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Auth & Quota Listeners
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    const unsubQuota = subscribeQuotaExceeded(() => {
      setSyncState('quota');
      showToast('Daily Firestore write quota reached. Progress is auto-saved locally.', 'warning');
    });
    return () => {
      unsubAuth();
      unsubQuota();
    };
  }, [showToast]);

  // Real-time Franchises List Subscription
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

  // Real-time Subcollection Subscriptions for Active Franchise
  useEffect(() => {
    if (!authReady || !authUser || !activeFranchiseId) return;
    const unsubCards = subscribeToSavedPlayers(activeFranchiseId, authUser.uid, setSavedCards);
    const unsubSnaps = subscribeToSeasonSnapshots(activeFranchiseId, authUser.uid, setSeasonSnapshots);
    const unsubRecs = subscribeToLeagueRecords(activeFranchiseId, authUser.uid, setLeagueRecords);

    return () => {
      unsubCards();
      unsubSnaps();
      unsubRecs();
    };
  }, [authReady, authUser, activeFranchiseId]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in with Google. Cloud sync enabled.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Sign-In failed.', 'error');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveFranchiseId(null);
    setSyncState('idle');
    showToast('Signed out of Firebase.', 'info');
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

  // Cloud + Local Auto-Save Helper (minimizes Firestore write units on routine ticks)
  const syncFranchiseSnapshotRef = useRef(0);
  const persistToCloud = useCallback(
    async (overrides?: Partial<{
      franchiseId: string;
      userTeamId: string;
      isNew: boolean;
      includePlayers: boolean;
      includeScheduleAndDraft: boolean;
      skipCloud: boolean;
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
      const fid = overrides?.franchiseId ?? activeFranchiseId ?? `LOCAL_${targetUserTeamId}`;
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
      };

      // Always write compact local backup first so state is never lost
      saveLocalFranchiseBackup({
        ...fullData,
        playoffResults: fullData.playoffResults ?? null,
        savedCards: overrides?.savedCards ?? savedCards,
        seasonSnapshots: overrides?.seasonSnapshots ?? seasonSnapshots,
        leagueRecords: overrides?.leagueRecords ?? leagueRecords,
        savedAtMs: Date.now(),
      });
      setLocalBackups(listLocalFranchiseBackups());

      if (!authUser || (!activeFranchiseId && !overrides?.franchiseId)) return;
      if (overrides?.skipCloud) return;

      if (isCloudQuotaPaused()) {
        setSyncState('quota');
        return;
      }

      const seq = ++syncFranchiseSnapshotRef.current;
      setSyncState('saving');
      try {
        await saveFullFranchiseToCloud(fullData, {
          isNew: Boolean(overrides?.isNew),
          includePlayers: overrides?.includePlayers ?? true,
          includeScheduleAndDraft: overrides?.includeScheduleAndDraft ?? Boolean(overrides?.isNew),
        });
        if (seq === syncFranchiseSnapshotRef.current) {
          setSyncState('synced');
        }
      } catch (err) {
        handleCloudWriteError(err);
      }
    },
    [
      authUser,
      activeFranchiseId,
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
    ]
  );

  const handleRetryCloudSync = async () => {
    if (!authUser || !activeFranchiseId) return;
    await resetCloudQuotaPause();
    setSyncState('saving');
    try {
      await persistToCloud({
        includePlayers: true,
        includeScheduleAndDraft: true,
      });
      if (!isCloudQuotaPaused()) {
        showToast('Cloud sync restored.', 'success');
      }
    } catch (err) {
      handleCloudWriteError(err);
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

    if (authUser) {
      setActiveFranchiseId(newFranchiseId);
      await persistToCloud({
        franchiseId: newFranchiseId,
        userTeamId: chosenTeamId,
        isNew: true,
        includePlayers: true,
        includeScheduleAndDraft: true,
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
    } else {
      setActiveFranchiseId(null);
      void persistToCloud({
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
    }
  };

  const resumeLocalBackup = (franchiseId: string) => {
    const backup = loadLocalFranchiseBackup(franchiseId);
    if (!backup) {
      showToast('Local dynasty backup not found.', 'error');
      return;
    }
    setUserTeamId(backup.userTeamId);
    setYear(backup.year);
    setPhase(backup.phase);
    setCurrentDay(backup.currentDay);
    setCurrentPickIdx(backup.currentPickIdx);
    setTeams(backup.teams);
    setPlayers(backup.players);
    setDraftPool(backup.draftPool);
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
    setActiveFranchiseId(backup.franchiseId.startsWith('FRAN_') ? backup.franchiseId : null);
    setSyncState(isCloudQuotaPaused() ? 'quota' : 'idle');
    setActiveTab(
      backup.phase === 'INAUGURAL_DRAFT' || backup.phase === 'ROOKIE_DRAFT' ? 'draft' : 'dashboard'
    );
    showToast(`Loaded local auto-save: ${backup.name} (${backup.year} · Day ${backup.currentDay}).`, 'info');
  };

  const resumeCloudFranchise = async (franchise: FranchiseSummary) => {
    if (!authUser) return;
    setLoadingFranchiseId(franchise.id);
    try {
      const localBackup = loadLocalFranchiseBackup(franchise.id);
      const localIsAhead =
        localBackup &&
        (localBackup.year > franchise.year ||
          (localBackup.year === franchise.year && localBackup.currentDay > franchise.currentDay));

      if (localIsAhead && localBackup) {
        resumeLocalBackup(franchise.id);
        setActiveFranchiseId(franchise.id);
        showToast(
          `Resumed newer local auto-save (${localBackup.year} · Day ${localBackup.currentDay}).`,
          'info'
        );
        return;
      }

      const chunks = await loadFranchiseChunksFromCloud(franchise.id, authUser.uid);
      setUserTeamId(franchise.userTeamId);
      setYear(franchise.year);
      setPhase(franchise.phase);
      setCurrentDay(franchise.currentDay);
      setCurrentPickIdx(franchise.currentPickIdx);
      setTeams(franchise.teams || []);
      setChampionsHistory(franchise.championsHistory || []);
      setTransactions(franchise.transactions || []);
      setRecentGames(franchise.recentGames || []);
      setPlayoffResults(franchise.playoffResults || null);

      setPlayers(chunks.players);
      setDraftPool(chunks.draftPool);
      setSchedule(chunks.schedule);
      setDraftPicks(chunks.draftPicks);
      setDraftOrder(chunks.draftOrder);
      setDraftHistory(chunks.draftHistory);

      setActiveFranchiseId(franchise.id);
      setSyncState(isCloudQuotaPaused() ? 'quota' : 'synced');
      setActiveTab(
        franchise.phase === 'INAUGURAL_DRAFT' || franchise.phase === 'ROOKIE_DRAFT'
          ? 'draft'
          : 'dashboard'
      );
      showToast(`Loaded ${franchise.name} (${franchise.year} · Day ${franchise.currentDay}).`, 'success');
    } catch (err) {
      const localBackup = loadLocalFranchiseBackup(franchise.id);
      if (localBackup) {
        resumeLocalBackup(franchise.id);
        return;
      }
      showToast('Failed to load franchise chunks from Firestore.', 'error');
      console.error(err);
    } finally {
      setLoadingFranchiseId(null);
    }
  };

  const handleDeleteCloudFranchise = async (franchiseId: string) => {
    try {
      await deleteFranchiseFromCloud(franchiseId);
      deleteLocalFranchiseBackup(franchiseId);
      setLocalBackups(listLocalFranchiseBackups());
      if (activeFranchiseId === franchiseId) {
        setActiveFranchiseId(null);
        setPhase('SETUP');
      }
      showToast('Saved franchise deleted.', 'info');
    } catch (err) {
      handleCloudWriteError(err);
    }
  };

  const handleDeleteLocalBackup = (franchiseId: string) => {
    deleteLocalFranchiseBackup(franchiseId);
    setLocalBackups(listLocalFranchiseBackups());
    showToast('Local auto-save removed.', 'info');
  };

  // ==========================================================================
  // DRAFT EXECUTION HELPERS
  // ==========================================================================

  const executeSingleDraftPick = useCallback(
    (chosenPlayerId: string | null, currentIdx: number, currentPool: Player[], currentPlayers: Player[]) => {
      const slot = draftOrder[currentIdx];
      if (!slot) return null;

      const teamRoster = currentPlayers.filter((p) => p.teamId === slot.teamId);
      let pickedPlayer = chosenPlayerId
        ? currentPool.find((p) => p.id === chosenPlayerId)
        : selectBestDraftPickForAI(currentPool, teamRoster);

      if (!pickedPlayer) pickedPlayer = currentPool[0];

      const updatedPlayer: Player = { ...pickedPlayer, teamId: slot.teamId };
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
    [draftOrder]
  );

  const finishActiveDraft = useCallback(
    (finalPlayers: Player[], remainingPool: Player[], isRookie: boolean, nextHist: DraftHistoryEntry[]) => {
      const waiverPlayers = remainingPool.map((p) => ({ ...p, teamId: null }));
      const mergedPlayers = [...finalPlayers, ...waiverPlayers];

      if (!isRookie) {
        const txEntry: TransactionEntry = {
          id: `draft-done-${Date.now()}`,
          year,
          day: 0,
          category: 'DRAFT',
          summary: `Inaugural 30-Round Draft complete. 960 players drafted; ${waiverPlayers.length} placed on Waiver Wire.`,
        };
        const updatedTx = [txEntry, ...transactions.slice(0, 148)];
        setPlayers(mergedPlayers);
        setDraftPool([]);
        setPhase('REGULAR_SEASON');
        setActiveTab('dashboard');
        setTransactions(updatedTx);
        showToast('Inaugural Draft Complete. Opening Day is ready.', 'success');
        void persistToCloud({
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
        const nextPhase: GamePhase = userRoster.length > 30 ? 'ROSTER_CUTS' : 'REGULAR_SEASON';
        const txEntry: TransactionEntry = {
          id: `rdraft-done-${Date.now()}`,
          year,
          day: 0,
          category: 'DRAFT',
          summary: `${year} Rookie Draft concluded. Remaining prospects added to Waiver Pool.`,
        };
        const updatedTx = [txEntry, ...transactions.slice(0, 148)];

        setPlayers(finalCombined);
        setDraftPool([]);
        setTransactions(updatedTx);
        setPhase(nextPhase);
        setActiveTab(nextPhase === 'ROSTER_CUTS' ? 'roster' : 'dashboard');

        if (nextPhase === 'ROSTER_CUTS') {
          showToast(`Rookie Draft complete. Trim your roster from ${userRoster.length} down to 30 players.`, 'warning');
        } else {
          showToast(`${year} Regular Season is ready.`, 'success');
        }

        void persistToCloud({
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
    [draftOrder.length, persistToCloud, showToast, transactions, userTeamId, year]
  );

  const handleUserDraftSelect = (playerId: string) => {
    const slot = draftOrder[currentPickIdx];
    if (!slot || slot.teamId !== userTeamId) return;

    const res = executeSingleDraftPick(playerId, currentPickIdx, draftPool, players);
    if (!res) return;

    const nextHist = [res.historyEntry, ...draftHistory];
    setDraftHistory(nextHist);
    if (res.nextIdx >= draftOrder.length) {
      finishActiveDraft(res.nextPlayers, res.nextPool, phase === 'ROOKIE_DRAFT', nextHist);
    } else {
      setCurrentPickIdx(res.nextIdx);
      setDraftPool(res.nextPool);
      setPlayers(res.nextPlayers);
    }
  };

  const handleSimNextPick = () => {
    if (currentPickIdx >= draftOrder.length) return;
    const res = executeSingleDraftPick(null, currentPickIdx, draftPool, players);
    if (!res) return;

    const nextHist = [res.historyEntry, ...draftHistory];
    setDraftHistory(nextHist);
    if (res.nextIdx >= draftOrder.length) {
      finishActiveDraft(res.nextPlayers, res.nextPool, phase === 'ROOKIE_DRAFT', nextHist);
    } else {
      setCurrentPickIdx(res.nextIdx);
      setDraftPool(res.nextPool);
      setPlayers(res.nextPlayers);
    }
  };

  const handleSimToUserTurn = () => {
    let idx = currentPickIdx;
    let pool = draftPool;
    let plrs = players;
    const newHist: DraftHistoryEntry[] = [];

    if (idx < draftOrder.length && draftOrder[idx].teamId === userTeamId) {
      const first = executeSingleDraftPick(null, idx, pool, plrs);
      if (first) {
        idx = first.nextIdx;
        pool = first.nextPool;
        plrs = first.nextPlayers;
        newHist.unshift(first.historyEntry);
      }
    }

    while (idx < draftOrder.length && draftOrder[idx].teamId !== userTeamId) {
      const step = executeSingleDraftPick(null, idx, pool, plrs);
      if (!step) break;
      idx = step.nextIdx;
      pool = step.nextPool;
      plrs = step.nextPlayers;
      newHist.unshift(step.historyEntry);
    }

    const mergedHist = [...newHist, ...draftHistory];
    setDraftHistory(mergedHist);
    if (idx >= draftOrder.length) {
      finishActiveDraft(plrs, pool, phase === 'ROOKIE_DRAFT', mergedHist);
    } else {
      setCurrentPickIdx(idx);
      setDraftPool(pool);
      setPlayers(plrs);
    }
  };

  const handleAutoDraftAll = () => {
    let idx = currentPickIdx;
    let pool = draftPool;
    let plrs = players;
    const newHist: DraftHistoryEntry[] = [];

    while (idx < draftOrder.length) {
      const step = executeSingleDraftPick(null, idx, pool, plrs);
      if (!step) break;
      idx = step.nextIdx;
      pool = step.nextPool;
      plrs = step.nextPlayers;
      newHist.unshift(step.historyEntry);
    }

    const mergedHist = [...newHist, ...draftHistory];
    setDraftHistory(mergedHist);
    finishActiveDraft(plrs, pool, phase === 'ROOKIE_DRAFT', mergedHist);
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
          const topFA = waivers[0];
          const weakest = aiRoster[0];
          if (topFA && weakest && topFA.ovr > weakest.ovr + 4) {
            topFA.teamId = randomAI.id;
            weakest.teamId = null;
            rosterLookup[randomAI.id] = [...aiRoster.slice(1), topFA];
            aiLogs.push({
              id: `ai-w-${d}-${randomAI.id}`,
              year,
              day: d + 1,
              category: 'WAIVER',
              summary: `${randomAI.city} ${randomAI.name} claimed ${topFA.position} ${topFA.name} (${topFA.ovr} OVR) and waived ${weakest.name} (${weakest.ovr} OVR).`,
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
          const p1 = r1[Math.floor(Math.random() * 8) + 4];
          const p2 = r2.find(
            (p) => p.id !== p1?.id && p1 && Math.abs(getPlayerTradeValue(p) - getPlayerTradeValue(p1)) < 85
          );
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
              summary: `TRADE: ${t1.id} acquires ${p2.position} ${p2.name} (${p2.ovr}) from ${t2.id} for ${p1.position} ${p1.name} (${p1.ovr}).`,
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

    // Checkpoints to minimize Firestore write units (>95% reduction)
    const crossedSeasonEnd = targetDay >= 162;
    const crossedMonth = Math.floor(targetDay / 30) > Math.floor(currentDay / 30) || crossedSeasonEnd;
    const crossedBiWeekly =
      Math.floor(targetDay / 14) > Math.floor(currentDay / 14) || numDays >= 14 || crossedSeasonEnd;
    const crossedWeek =
      Math.floor(targetDay / 7) > Math.floor(currentDay / 7) || numDays >= 7 || crossedMonth;

    const shouldSyncCloud = Boolean(authUser && activeFranchiseId && !isCloudQuotaPaused());

    // Always persist full state locally; sync to cloud at weekly/milestone checkpoints
    void persistToCloud({
      skipCloud: !shouldSyncCloud || !crossedWeek,
      includePlayers: crossedMonth,
      includeScheduleAndDraft: false,
      phase: nextPhase,
      currentDay: targetDay,
      teams: workingTeams,
      players: workingPlayers,
      recentGames: updatedRecentGames,
      transactions: updatedTransactions,
      playoffResults: nextPlayoffs,
      championsHistory: nextChamps,
      seasonSnapshots: nextSnapshots,
      leagueRecords: nextRecords,
    });

    if (shouldSyncCloud && activeFranchiseId) {
      if (crossedBiWeekly) {
        void recordSeasonSnapshot(snapPayload).catch((err) => handleCloudWriteError(err, true));
      }
      if ((crossedMonth || numDays >= 30) && recordUpdates.length > 0) {
        void upsertLeagueRecords(activeFranchiseId, recordUpdates, leagueRecords).catch((err) =>
          handleCloudWriteError(err, true)
        );
      }
      if (crossedMonth) {
        const matchingSaved = savedCards.filter((c) => workingPlayers.some((p) => p.id === c.playerId));
        matchingSaved.forEach((card) => {
          const liveP = workingPlayers.find((p) => p.id === card.playerId);
          if (liveP) {
            void upsertSavedPlayerCard(
              {
                ...card,
                teamId: liveP.teamId || 'FA',
                seasonStats: liveP.seasonStats,
                careerStats: liveP.careerStats,
              },
              false
            ).catch((err) => handleCloudWriteError(err, true));
          }
        });
      }
    }
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
  // OFFSEASON PROGRESSION & ANNUAL ROOKIE DRAFT
  // ==========================================================================

  const advanceToOffseasonRookieDraft = () => {
    const nextYear = year + 1;
    const updatedPlayers: Player[] = [];
    let retiredCount = 0;

    for (const p of players) {
      const mergedCareer: Record<string, number> = {};
      for (const k of Object.keys(p.careerStats)) {
        mergedCareer[k] = (p.careerStats[k] || 0) + (p.seasonStats[k] || 0);
      }

      const nextAge = p.age + 1;
      if (nextAge >= 36 && Math.random() < (nextAge - 34) * 0.22) {
        retiredCount++;
        continue;
      }

      let delta = 0;
      if (nextAge <= 24) {
        delta = Math.round(Math.random() * 4 + (p.potential > p.ovr ? 2 : 0));
      } else if (nextAge <= 29) {
        delta = Math.round((Math.random() - 0.35) * 3);
      } else if (nextAge <= 33) {
        delta = -Math.round(Math.random() * 3);
      } else {
        delta = -Math.round(Math.random() * 4 + 1);
      }

      const agedPlayer: Player = {
        ...p,
        age: nextAge,
        careerStats: mergedCareer,
        seasonStats: createEmptySeasonStats(p.isPitcher),
      };

      if (agedPlayer.isPitcher) {
        agedPlayer.velocity = clamp((agedPlayer.velocity ?? 50) + delta + Math.round((Math.random() - 0.5) * 2), 20, 99);
        agedPlayer.control = clamp((agedPlayer.control ?? 50) + delta + Math.round((Math.random() - 0.5) * 2), 20, 99);
        agedPlayer.finesse = clamp((agedPlayer.finesse ?? 50) + delta + Math.round((Math.random() - 0.5) * 2), 20, 99);
      } else {
        agedPlayer.power = clamp((agedPlayer.power ?? 50) + delta + Math.round((Math.random() - 0.5) * 2), 20, 99);
        agedPlayer.speed = clamp((agedPlayer.speed ?? 50) + (nextAge > 29 ? delta - 1 : delta), 20, 99);
        agedPlayer.glove = clamp((agedPlayer.glove ?? 50) + delta + Math.round((Math.random() - 0.5) * 2), 20, 99);
      }
      agedPlayer.ovr = calculateOverall(agedPlayer);
      updatedPlayers.push(agedPlayer);
    }

    const reverseStandings = [...teams].sort((a, b) => {
      if (a.wins !== b.wins) return a.wins - b.wins;
      return a.runsScored - a.runsAllowed - (b.runsScored - b.runsAllowed);
    });

    const slotByOrigTeam: Record<string, number> = {};
    reverseStandings.forEach((t, idx) => {
      slotByOrigTeam[t.id] = idx + 1;
    });

    const yearPicks = draftPicks.filter((pk) => pk.year === nextYear);
    const orderedRookiePicks: DraftSlot[] = [];
    for (let r = 1; r <= 5; r++) {
      const roundPicks = yearPicks
        .filter((pk) => pk.round === r)
        .sort((a, b) => (slotByOrigTeam[a.originalTeamId] || 16) - (slotByOrigTeam[b.originalTeamId] || 16));

      roundPicks.forEach((pk, idx) => {
        orderedRookiePicks.push({
          pickNum: (r - 1) * 32 + idx + 1,
          round: r,
          teamId: pk.ownerTeamId,
          originalTeamId: pk.originalTeamId,
          pickId: pk.id,
        });
      });
    }

    const rookieClass = generateRookieClass(nextYear);
    const resetTeams = teams.map((t) => ({
      ...t,
      wins: 0,
      losses: 0,
      runsScored: 0,
      runsAllowed: 0,
      streak: 0,
      last10: [],
    }));

    const newFutureYear = nextYear + 3;
    const addedFuturePicks: DraftPick[] = [];
    for (let r = 1; r <= 5; r++) {
      for (const t of resetTeams) {
        addedFuturePicks.push({
          id: `PICK-${newFutureYear}-R${r}-${t.id}`,
          year: newFutureYear,
          round: r,
          originalTeamId: t.id,
          ownerTeamId: t.id,
        });
      }
    }

    const nextSchedule = generateSeasonSchedule(resetTeams);
    const nextDraftPicks = [...draftPicks.filter((pk) => pk.year > nextYear), ...addedFuturePicks];
    const txEntry: TransactionEntry = {
      id: `offseason-${nextYear}-${Date.now()}`,
      year: nextYear,
      day: 0,
      category: 'OFFSEASON',
      summary: `Offseason ${nextYear}: ${retiredCount} veterans retired. Reverse-standings 5-round Rookie Draft underway (#1 pick: ${orderedRookiePicks[0]?.teamId}).`,
    };
    const nextTx = [txEntry, ...transactions.slice(0, 148)];

    setYear(nextYear);
    setTeams(resetTeams);
    setPlayers(updatedPlayers);
    setDraftPicks(nextDraftPicks);
    setSchedule(nextSchedule);
    setCurrentDay(0);
    setPlayoffResults(null);
    setRecentGames([]);
    setDraftOrder(orderedRookiePicks);
    setCurrentPickIdx(0);
    setDraftPool(rookieClass);
    setDraftHistory([]);
    setTransactions(nextTx);
    setPhase('ROOKIE_DRAFT');
    setActiveTab('draft');
    showToast(`Welcome to the ${nextYear} Offseason & Rookie Draft.`, 'info');

    void persistToCloud({
      year: nextYear,
      phase: 'ROOKIE_DRAFT',
      includePlayers: true,
      includeScheduleAndDraft: true,
      currentDay: 0,
      currentPickIdx: 0,
      teams: resetTeams,
      players: updatedPlayers,
      draftPool: rookieClass,
      schedule: nextSchedule,
      draftPicks: nextDraftPicks,
      draftOrder: orderedRookiePicks,
      draftHistory: [],
      playoffResults: null,
      recentGames: [],
      transactions: nextTx,
    });
  };

  // ==========================================================================
  // WAIVER WIRE, TRADES & ROSTER CUTS
  // ==========================================================================

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

    const nextPlayers = players.map((p) => {
      if (p.id === claimPlayerId) return { ...p, teamId: userTeamId };
      if (dropPlr && p.id === dropPlr.id) return { ...p, teamId: null };
      return p;
    });

    const msg = dropPlr
      ? `${userTeamId} claimed ${claimPlr.position} ${claimPlr.name} (${claimPlr.ovr}) from waivers and released ${dropPlr.name} (${dropPlr.ovr}).`
      : `${userTeamId} signed ${claimPlr.position} ${claimPlr.name} (${claimPlr.ovr}) from waivers.`;
    const nextTx = [
      { id: `wv-${Date.now()}`, year, day: currentDay, category: 'WAIVER', summary: msg },
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

  const handleReleasePlayer = (dropPlayerId: string) => {
    const dropPlr = players.find((p) => p.id === dropPlayerId && p.teamId === userTeamId);
    if (!dropPlr) return;

    const nextPlayers = players.map((p) => (p.id === dropPlayerId ? { ...p, teamId: null } : p));
    const msg = `${userTeamId} released ${dropPlr.position} ${dropPlr.name} (${dropPlr.ovr}) to the Waiver Pool.`;
    const nextTx = [
      { id: `rel-${Date.now()}`, year, day: currentDay, category: 'WAIVER', summary: msg },
      ...transactions.slice(0, 148),
    ];

    setPlayers(nextPlayers);
    setTransactions(nextTx);
    showToast(`Released ${dropPlr.name} to waivers.`, 'info');
    void persistToCloud({
      includePlayers: true,
      includeScheduleAndDraft: false,
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

    const newUserCount = userRoster.length - userPlayerIds.length + aiPlayerIds.length;
    const newAiCount = aiRoster.length - aiPlayerIds.length + userPlayerIds.length;

    if (newUserCount > 30 || newAiCount > 30) {
      showToast(
        `Trade violates 30-man roster limit (Resulting sizes: You ${newUserCount}, ${partnerTeamId} ${newAiCount}).`,
        'error'
      );
      return false;
    }

    const nextPlayers = players.map((p) => {
      if (userPlayerIds.includes(p.id)) return { ...p, teamId: partnerTeamId };
      if (aiPlayerIds.includes(p.id)) return { ...p, teamId: userTeamId };
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
    void persistToCloud({ skipCloud: true, savedCards: nextCards });

    if (authUser && activeFranchiseId && !isCloudQuotaPaused()) {
      try {
        await upsertSavedPlayerCard(cardData, !existing);
      } catch (err) {
        handleCloudWriteError(err);
      }
    }
    showToast(`Saved ${player.name} to Player Card Vault.`, 'success');
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
      ovr,
      potential: params.potential,
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

    if (authUser && activeFranchiseId && !isCloudQuotaPaused()) {
      try {
        await upsertSavedPlayerCard(cardPayload, true);
        if (params.targetDestination !== 'VAULT_ONLY') {
          await persistToCloud({
            includePlayers: true,
            includeScheduleAndDraft: false,
            players: nextPlayers,
            transactions: nextTx,
            savedCards: nextCards,
          });
        } else {
          void persistToCloud({ skipCloud: true, savedCards: nextCards });
        }
      } catch (err) {
        handleCloudWriteError(err);
      }
    } else {
      void persistToCloud({
        skipCloud: true,
        players: nextPlayers,
        transactions: nextTx,
        savedCards: nextCards,
      });
    }
    showToast(`Created ${params.name} (${ovr} OVR) player card.`, 'success');
  };

  const handleUpdateCardTheme = async (card: SavedPlayerCard, theme: CardTheme) => {
    const nextCards = savedCards.map((c) => (c.id === card.id ? { ...c, cardTheme: theme } : c));
    setSavedCards(nextCards);
    void persistToCloud({ skipCloud: true, savedCards: nextCards });

    if (authUser && activeFranchiseId && !isCloudQuotaPaused()) {
      try {
        await upsertSavedPlayerCard({ ...card, cardTheme: theme }, false);
      } catch (err) {
        handleCloudWriteError(err);
      }
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    const nextCards = savedCards.filter((c) => c.id !== cardId);
    setSavedCards(nextCards);
    void persistToCloud({ skipCloud: true, savedCards: nextCards });

    if (authUser && activeFranchiseId && !isCloudQuotaPaused()) {
      try {
        await deleteSavedPlayerCard(activeFranchiseId, cardId);
      } catch (err) {
        handleCloudWriteError(err);
      }
    }
    showToast('Removed player card from vault.', 'info');
  };

  // ==========================================================================
  // SETUP / FRANCHISE SELECTION & CLOUD RESUME VIEW
  // ==========================================================================

  if (phase === 'SETUP') {
    const selectedCfg = TEAM_CONFIGS.find((t) => t.id === userTeamId);
    return (
      <div className="min-h-screen bg-[#090D16] text-slate-100 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Top Bar */}
          <header className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-800 pb-6">
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-sky-400">
                32-Team Baseball Front Office & Analytics Platform
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Diamond Dynasty GM
              </h1>
              <p className="text-slate-400 max-w-2xl text-sm">
                Draft from a 1,344-player universe, build dynamic player cards, track real-time division & league records, and analyze multi-season performance trends backed by Firebase.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {authReady && !authUser && (
                <button
                  onClick={handleSignIn}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition cursor-pointer whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4 text-sky-400" />
                  Sign In with Google to Save & Sync
                </button>
              )}
              {authUser && (
                <div className="flex items-center gap-3 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-300 truncate max-w-[180px]">{authUser.email}</span>
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
                    Daily Firestore Free Write Quota Reached — Local Auto-Save Active
                  </div>
                  <p className="text-amber-200/80 text-xs">
                    Your free daily database write units reset tomorrow. You can keep playing seamlessly via local browser saves, or upgrade your Spark plan database under the Enterprise Edition section.
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

          {/* Saved Firebase Dynasties */}
          {authUser && cloudFranchises.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">
                  Saved Cloud Dynasties ({cloudFranchises.length})
                </h2>
                <span className="text-xs text-slate-400">Synced via Firestore</span>
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
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
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
                        {loadingFranchiseId === fran.id ? 'Loading Roster & Schedule...' : 'Resume Dynasty'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Local Auto-Saved Dynasties */}
          {localBackups.filter((lb) => !cloudFranchises.some((cf) => cf.id === lb.franchiseId)).length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  Local Auto-Saved Dynasties
                </h2>
                <span className="text-xs text-slate-400">Stored in this browser</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {localBackups
                  .filter((lb) => !cloudFranchises.some((cf) => cf.id === lb.franchiseId))
                  .map((lb) => {
                    const cfg = TEAM_CONFIGS.find((t) => t.id === lb.userTeamId);
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
                              <div className="text-xs text-slate-400 font-mono mt-0.5">
                                {lb.year} · Day {lb.currentDay}/162 · {lb.wins}-{lb.losses}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteLocalBackup(lb.franchiseId)}
                            aria-label={`Delete local ${lb.name}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => resumeLocalBackup(lb.franchiseId)}
                          className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                        >
                          Resume Local Auto-Save
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

  const navItems = [
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
    { id: 'waivers', label: `Waivers (${waiverPool.length})`, icon: UserPlus, disabled: isDraftPhase },
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
              <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
                <span className="text-sky-400 font-semibold">{year}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-semibold">
                  {userTeam?.wins ?? 0}-{userTeam?.losses ?? 0}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {phase === 'INAUGURAL_DRAFT' && 'Inaugural Draft'}
                  {phase === 'ROOKIE_DRAFT' && 'Rookie Draft'}
                  {phase === 'ROSTER_CUTS' && 'Roster Cuts'}
                  {phase === 'REGULAR_SEASON' && `Day ${currentDay}/162`}
                  {phase === 'PLAYOFFS_COMPLETE' && 'Playoffs Complete'}
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
                onClick={advanceToOffseasonRookieDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" /> Advance to {year + 1} Draft
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

            {authUser ? (
              <button
                onClick={() =>
                  syncState === 'quota'
                    ? void handleRetryCloudSync()
                    : void persistToCloud({ includePlayers: true, includeScheduleAndDraft: isDraftPhase })
                }
                disabled={syncState === 'saving'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  syncState === 'quota'
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
                title="Save Franchise State"
              >
                <Save className="w-3.5 h-3.5 text-sky-400" />
                {syncState === 'saving'
                  ? 'Saving...'
                  : syncState === 'quota'
                  ? 'Local Save (Retry Sync)'
                  : syncState === 'synced'
                  ? 'Synced'
                  : 'Save'}
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-xs font-semibold text-sky-300 transition cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In to Sync
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
            onAdvanceOffseason={advanceToOffseasonRookieDraft}
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
            teamMap={teamMap}
            draftOrder={draftOrder}
            currentPickIdx={currentPickIdx}
            draftPool={draftPool}
            draftHistory={draftHistory}
            userRoster={userRoster}
            draftPicks={draftPicks}
            onUserPick={handleUserDraftSelect}
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
