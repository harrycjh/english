import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary, SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoView } from '../models/local-media';
import type { ParentSetting, ProfileId } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import {
  getMainRouteDirection,
  isMainAppRoute,
  type AppRoute,
  type MainAppRoute,
  type MainRouteDirection,
} from './routes';
import { CompletionPage } from '../screens/CompletionPage';
import { ReviewPage } from '../screens/HomePage';
import { LearningPage } from '../screens/LearningPage';
import { SelectionPage } from '../screens/SelectionPage';
import { StatsPage } from '../screens/StatsPage';
import { SettingsPage } from '../screens/SettingsPage';
import {
  buildDailyTask,
  addDaysToDateKey,
  createDateKey,
  createDateTimeForDateKey,
  expandDailyTaskPlan,
  getTaskStudyQueue,
  normalizeDailyTaskPlan,
  reconcileTaskCompletion,
  recordTaskAnswer,
} from '../services/task-service';
import { applyConsecutiveWrongPolicy, getWrongPracticeWordIds } from '../services/answer-event-service';
import { ensureSelectionStateMap, getActiveStudyWords } from '../services/selection-service';
import { createEmptyRecord, evaluateAnswer, isMastered } from '../services/spaced-repetition';
import {
  clearLocalDeviceData,
  countLocalLifePhotos,
  getDailyTask,
  getOrCreateSyncMetadata,
  getParentSetting,
  listAnswerEvents,
  listDailyTasks,
  listLearningRecords,
  listRecentTasks,
  listWordSelectionStates,
  replaceStudyData,
  saveAnswerAndLearningRecord,
  saveDailyTask,
  saveParentSetting,
  saveWordSelectionStates,
} from '../services/storage-service';
import { verifyFamilyCode } from '../services/cloud-sync-service';
import type { StartupSyncResult } from '../services/startup-sync-service';
import { buildStudyDataExport, downloadJsonFile } from '../services/study-data-export';
import {
  readStudyDataImport,
  type StudyDataImportResult,
} from '../services/study-data-import';
import {
  loadLocalLifePhotoViews,
  revokeLocalLifePhotoViews,
} from '../services/local-media-service';
import {
  downloadPrivateLifePhotos,
  type PrivateLifePhotoDownloadOptions,
  type PrivateLifePhotoDownloadResult,
} from '../services/private-life-photo-service';
import { loadWordPayload } from '../services/word-service';
import { APP_VERSION } from '../config/app-meta';
import { getMillisecondsUntilNextStudyDay } from '../services/study-day';
import { configureSpeechVoices } from '../services/audio-service';
import { buildQuestion } from '../services/question-service';
import { BottomDock } from '../components/BottomDock';
import { ProfileSelector } from '../components/ProfileSelector';
import {
  calculateIpadStageScale,
  getConservativeViewportLength,
  getStableViewportLength,
  isStandaloneIpad,
} from './ipad-viewport';
import {
  createDebugProgressionPlan,
  DEBUG_PROGRESSION_LEVELS,
  isQuestionKindForDebugLevel,
  sampleDebugWordIds,
} from './debug-session';

interface FixedDebugSession {
  mode: 'fixed';
  level: number;
  wordIds: string[];
}

interface ProgressionDebugSession {
  mode: 'progression';
  levels: number[];
  wordIds: string[];
}

type DebugSession = FixedDebugSession | ProgressionDebugSession;

interface MainShellChromeProps {
  profileId: ProfileId;
  onSelectProfile: (profileId: ProfileId) => void | Promise<void>;
}

function MainShellChrome({ profileId, onSelectProfile }: MainShellChromeProps) {
  return (
    <header className="main-shell-chrome" data-profile={profileId}>
      <div className="app-brand-lockup">
        <span className="app-brand-lockup__mark" aria-hidden="true" />
        <span className="app-brand-lockup__wordmark">VocaRabbit</span>
        <span className="app-version-badge">{APP_VERSION}</span>
      </div>
      <ProfileSelector
        value={profileId}
        buttonClassName="main-shell-chrome__profile app-profile-chip"
        onChange={onSelectProfile}
      />
    </header>
  );
}

function getPreviewWords(payload: WordPayload | null, task: DailyTaskSummary | null) {
  if (!payload || !task) {
    return [];
  }

  const wordIds = [...task.newWordIds, ...task.reviewWordIds].slice(0, 4);
  const wordsById = new Map(payload.words.map((word) => [word.id, word]));
  return wordIds.map((wordId) => wordsById.get(wordId)).filter(Boolean) as WordPayload['words'];
}

function getAuthoritativeTaskAnswerIds(task: DailyTaskSummary, events: AnswerEvent[]): string[] {
  const eventWordIds = [...new Set(
    events
      .filter((event) => event.dateKey === task.dateKey && event.isCorrect)
      .map((event) => event.wordId),
  )];
  return eventWordIds.length > 0 ? eventWordIds : task.answeredWordIds;
}

function addLocalLifePhotoViews(
  current: Record<string, LocalLifePhotoView>,
  next: Record<string, LocalLifePhotoView>,
): Record<string, LocalLifePhotoView> {
  const additions = Object.fromEntries(
    Object.entries(next).filter(([wordId]) => !current[wordId]),
  );
  const duplicates = Object.fromEntries(
    Object.entries(next).filter(([wordId]) => Boolean(current[wordId])),
  );
  revokeLocalLifePhotoViews(duplicates);
  return Object.keys(additions).length > 0 ? { ...current, ...additions } : current;
}

interface AppProps {
  syncRevision?: number;
  onRequestSync?: () => Promise<StartupSyncResult>;
}

export default function App({ syncRevision = 0, onRequestSync }: AppProps) {
  const [route, setRoute] = useState<AppRoute>('home');
  const [previousMainRoute, setPreviousMainRoute] = useState<MainAppRoute | null>(null);
  const [mainRouteDirection, setMainRouteDirection] = useState<MainRouteDirection>('forward');
  const mainRouteTransitionTimer = useRef<number | null>(null);
  const [payload, setPayload] = useState<WordPayload | null>(null);
  const [recordsById, setRecordsById] = useState<Record<string, LearningRecord>>({});
  const [answerEvents, setAnswerEvents] = useState<AnswerEvent[]>([]);
  const [selectionById, setSelectionById] = useState<Record<string, WordSelectionState>>({});
  const [localLifePhotosById, setLocalLifePhotosById] = useState<Record<string, LocalLifePhotoView>>({});
  const [localLifePhotoCount, setLocalLifePhotoCount] = useState(0);
  const localLifePhotoViewsRef = useRef(localLifePhotosById);
  const [parentSetting, setParentSetting] = useState<ParentSetting | null>(null);
  const [task, setTask] = useState<DailyTaskSummary | null>(null);
  const [practiceWordIds, setPracticeWordIds] = useState<string[] | null>(null);
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null);
  const [isDebugPickerOpen, setIsDebugPickerOpen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<DailyTaskSummary[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const privatePhotoPrefetchKey = useRef<string | null>(null);

  useEffect(() => {
    configureSpeechVoices({
      englishVoiceURI: parentSetting?.englishVoiceURI ?? '',
      chineseVoiceURI: parentSetting?.chineseVoiceURI ?? '',
    });
  }, [parentSetting?.englishVoiceURI, parentSetting?.chineseVoiceURI]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      window.location.reload();
    }, getMillisecondsUntilNextStudyDay() + 1_000);
    return () => window.clearTimeout(refreshTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        if (syncRevision === 0) setLoading(true);
        const [
          payloadValue,
          savedRecords,
          savedSetting,
          savedSelection,
          savedAnswerEvents,
        ] = await Promise.all([
          loadWordPayload(),
          listLearningRecords(),
          getParentSetting(),
          listWordSelectionStates(),
          listAnswerEvents(),
        ]);
        const todayKey = createDateKey();
        const { nextSelectionById, missingStates } = ensureSelectionStateMap(payloadValue.words, savedSelection);

        if (missingStates.length > 0) {
          await saveWordSelectionStates(missingStates);
        }

        let todayTask = await getDailyTask(todayKey);
        if (!todayTask) {
          todayTask = buildDailyTask(payloadValue.words, savedRecords, savedSetting, new Date(), nextSelectionById);
          await saveDailyTask(todayTask);
        } else {
          const normalizedTask = normalizeDailyTaskPlan(
            todayTask,
            payloadValue.words,
            savedRecords,
            savedSetting,
            new Date(),
            nextSelectionById,
            getAuthoritativeTaskAnswerIds(todayTask, savedAnswerEvents),
          );
          const reconciledTask = reconcileTaskCompletion(
            normalizedTask,
            getAuthoritativeTaskAnswerIds(normalizedTask, savedAnswerEvents),
          );
          if (reconciledTask !== todayTask) {
            todayTask = reconciledTask;
            await saveDailyTask(todayTask);
          }
        }

        const activePhotoWordIds = [...new Set([
          ...todayTask.reviewWordIds,
          ...todayTask.newWordIds,
        ])].filter((wordId) => !localLifePhotoViewsRef.current[wordId]);
        const [history, savedLocalLifePhotos, savedLocalLifePhotoCount] = await Promise.all([
          listRecentTasks(90),
          loadLocalLifePhotoViews(activePhotoWordIds),
          countLocalLifePhotos(),
        ]);

        if (!cancelled) {
          setPayload(payloadValue);
          setRecordsById(savedRecords);
          setAnswerEvents(savedAnswerEvents);
          setSelectionById(nextSelectionById);
          setLocalLifePhotosById((current) => addLocalLifePhotoViews(current, savedLocalLifePhotos));
          setLocalLifePhotoCount(savedLocalLifePhotoCount);
          setParentSetting(savedSetting);
          setTask(todayTask);
          setRecentTasks(history);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : '初始化失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [syncRevision]);

  useEffect(() => {
    localLifePhotoViewsRef.current = localLifePhotosById;
  }, [localLifePhotosById]);
  useEffect(() => () => {
    revokeLocalLifePhotoViews(localLifePhotoViewsRef.current);
  }, []);

  async function ensureLocalLifePhoto(wordId: string) {
    if (localLifePhotoViewsRef.current[wordId]) {
      return;
    }
    try {
      const nextViews = await loadLocalLifePhotoViews([wordId]);
      if (nextViews[wordId]) {
        setLocalLifePhotosById((current) => addLocalLifePhotoViews(current, nextViews));
      }
    } catch {
      // Keep the bundled image fallback if IndexedDB is unavailable.
    }
  }

  useEffect(() => {
    if (!payload || !task) return;
    const wordIds = [...new Set([...task.reviewWordIds, ...task.newWordIds])]
      .filter((wordId) => payload.words.find((word) => word.id === wordId)?.relatedMedia?.lifePhoto);
    if (wordIds.length === 0) return;
    const prefetchKey = `${task.dateKey}:${wordIds.join(',')}`;
    if (privatePhotoPrefetchKey.current === prefetchKey) return;
    let cancelled = false;

    void downloadPrivateLifePhotos(wordIds).then(async (result) => {
      privatePhotoPrefetchKey.current = prefetchKey;
      if (cancelled || result.downloaded === 0) return;
      const unloadedWordIds = wordIds.filter((wordId) => !localLifePhotoViewsRef.current[wordId]);
      const nextLocalLifePhotos = await loadLocalLifePhotoViews(unloadedWordIds);
      if (!cancelled) {
        setLocalLifePhotosById((current) => addLocalLifePhotoViews(current, nextLocalLifePhotos));
        setLocalLifePhotoCount(await countLocalLifePhotos());
      }
    }).catch(() => {
      // A device without a cloud token keeps the existing Comfy image fallback.
    });

    return () => {
      cancelled = true;
    };
  }, [payload, syncRevision, task]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const viewport = window.visualViewport;
    let syncFrame: number | null = null;
    let settleTimer: number | null = null;

    function syncShellState() {
      const shouldLockIpadShell = true;
      const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
      const installedIpad = isStandaloneIpad({
        userAgent: navigatorWithStandalone.userAgent,
        platform: navigatorWithStandalone.platform,
        maxTouchPoints: navigatorWithStandalone.maxTouchPoints,
        standalone: navigatorWithStandalone.standalone === true,
        displayModeInstalled: window.matchMedia('(display-mode: fullscreen)').matches
          || window.matchMedia('(display-mode: standalone)').matches,
      });
      const screenLongEdge = Math.max(window.screen.width, window.screen.height);
      const screenShortEdge = Math.min(window.screen.width, window.screen.height);
      // Installed iPad apps can briefly report a visual viewport about 50px
      // shorter after resume. Keep the physical screen measurement so the
      // 1194 x 834 stage remains edge-to-edge instead of shrinking all around.
      const viewportWidth = installedIpad
        ? getStableViewportLength(viewport?.width, window.innerWidth, root.clientWidth, screenLongEdge)
        : getConservativeViewportLength(viewport?.width, window.innerWidth, root.clientWidth);
      const viewportHeight = installedIpad
        ? getStableViewportLength(viewport?.height, window.innerHeight, root.clientHeight, screenShortEdge)
        : getConservativeViewportLength(viewport?.height, window.innerHeight, root.clientHeight);
      const orientation = viewportWidth >= viewportHeight ? 'landscape' : 'portrait';
      const shellMode = shouldLockIpadShell ? 'ipad-fixed' : 'fluid';
      const stageScale = calculateIpadStageScale(
        viewportWidth,
        viewportHeight,
        installedIpad ? 'landscape-width' : 'contain',
      );
      const viewportTop = installedIpad ? 0 : Math.max(0, viewport?.offsetTop ?? 0);

      root.dataset.shellMode = shellMode;
      root.dataset.orientation = orientation;
      body.dataset.shellMode = shellMode;
      body.dataset.orientation = orientation;
      root.style.setProperty('--ipad-shell-scale', String(stageScale));
      root.style.setProperty('--ipad-shell-viewport-top', `${viewportTop}px`);
    }

    function scheduleShellSync() {
      syncShellState();

      if (syncFrame !== null) {
        window.cancelAnimationFrame(syncFrame);
      }
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        syncShellState();
      });

      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        syncShellState();
      }, 250);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        scheduleShellSync();
      }
    }

    scheduleShellSync();
    window.addEventListener('resize', scheduleShellSync);
    window.addEventListener('orientationchange', scheduleShellSync);
    window.addEventListener('pageshow', scheduleShellSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    viewport?.addEventListener('resize', scheduleShellSync);
    viewport?.addEventListener('scroll', scheduleShellSync);

    return () => {
      window.removeEventListener('resize', scheduleShellSync);
      window.removeEventListener('orientationchange', scheduleShellSync);
      window.removeEventListener('pageshow', scheduleShellSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      viewport?.removeEventListener('resize', scheduleShellSync);
      viewport?.removeEventListener('scroll', scheduleShellSync);
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      delete root.dataset.shellMode;
      delete root.dataset.orientation;
      delete body.dataset.shellMode;
      delete body.dataset.orientation;
      root.style.removeProperty('--ipad-shell-scale');
      root.style.removeProperty('--ipad-shell-viewport-top');
    };
  }, []);

  const previewWords = useMemo(() => getPreviewWords(payload, task), [payload, task]);
  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => isMastered(record)).length,
    [recordsById]
  );
  useEffect(() => {
    if (!task) return;
    const reconciledTask = reconcileTaskCompletion(
      task,
      getAuthoritativeTaskAnswerIds(task, answerEvents),
    );
    if (reconciledTask === task) return;
    setTask(reconciledTask);
    void saveDailyTask(reconciledTask).then(refreshRecentTasks);
  }, [answerEvents, task]);

  async function refreshRecentTasks() {
    setRecentTasks(await listRecentTasks(90));
  }

  async function rebuildTodayTask(
    nextRecords: Record<string, LearningRecord> = recordsById,
    nextSetting: ParentSetting | null = parentSetting,
    nextSelection: Record<string, WordSelectionState> = selectionById
  ) {
    if (!payload || !nextSetting) {
      return;
    }

    const studyDate = task ? createDateTimeForDateKey(task.dateKey) : new Date();
    const nextTask = buildDailyTask(payload.words, nextRecords, nextSetting, studyDate, nextSelection);
    await saveDailyTask(nextTask);
    setTask(nextTask);
    await refreshRecentTasks();
  }

  async function expandCurrentTaskPlan(nextSetting: ParentSetting) {
    if (!payload || !task) return;
    const nextTask = normalizeDailyTaskPlan(
      task,
      payload.words,
      recordsById,
      nextSetting,
      createDateTimeForDateKey(task.dateKey),
      selectionById,
      getAuthoritativeTaskAnswerIds(task, answerEvents),
    );
    if (nextTask === task) return;
    await saveDailyTask(nextTask);
    setTask(nextTask);
    setSessionResult(null);
    await refreshRecentTasks();
  }

  async function handleAnswer(event: AnswerEvent) {
    const policyEvent = applyConsecutiveWrongPolicy(answerEvents, event);
    const currentRecord = recordsById[event.wordId] ?? createEmptyRecord(event.wordId);
    const nextRecord = evaluateAnswer(
      currentRecord,
      policyEvent.isCorrect,
      new Date(policyEvent.answeredAt),
      policyEvent.learningAction,
      policyEvent.levelDowngrade,
    );
    const enrichedEvent = {
      ...policyEvent,
      learningStateBefore: currentRecord,
      learningStateAfter: nextRecord,
    };
    await saveAnswerAndLearningRecord(enrichedEvent, nextRecord);
    setAnswerEvents((previous) => [...previous.slice(-499), enrichedEvent]);

    if (!practiceWordIds && task && !task.completedAt) {
      const latestTask = await getDailyTask(task.dateKey) ?? task;
      const nextTask = recordTaskAnswer(latestTask, event.isCorrect, event.wordId);
      await saveDailyTask(nextTask);
      setTask(nextTask);
      await refreshRecentTasks();
    }

    setRecordsById((previous) => ({
      ...previous,
      [event.wordId]: nextRecord,
    }));
  }

  async function handleComplete(result: SessionResult) {
    if (!task) {
      return;
    }

    if (practiceWordIds) {
      setPracticeWordIds(null);
      setSessionResult(result);
      startTransition(() => setRoute('complete'));
      return;
    }

    const latestTask = await getDailyTask(task.dateKey) ?? task;
    const completedTask = reconcileTaskCompletion({
      ...latestTask,
      completedAt: createDateTimeForDateKey(task.dateKey).toISOString(),
    });

    await saveDailyTask(completedTask);
    setTask(completedTask);
    if (!completedTask.completedAt) {
      setSessionResult(null);
      startTransition(() => setRoute('home'));
      return;
    }
    setSessionResult(result);
    await refreshRecentTasks();
    startTransition(() => setRoute('complete'));
  }

  function handleStart() {
    setIsDebugPickerOpen(false);
    setDebugSession(null);
    setPracticeWordIds(null);
    startTransition(() => setRoute('learning'));
  }

  function handleStartDebug(level: number | 'progression') {
    if (!payload || !parentSetting || parentSetting.profileId !== 'stinky-dog') return;
    const debugSetting = { ...parentSetting, showImages: true };
    const debugLevels = level === 'progression'
      ? DEBUG_PROGRESSION_LEVELS
      : [Math.min(10, Math.max(0, level))];
    const candidates = getActiveStudyWords(payload.words, selectionById)
      .filter((word) => {
        return debugLevels.every((debugLevel) => {
          const record = {
            ...createEmptyRecord(word.id),
            masteryLevel: debugLevel,
            reviewStage: debugLevel,
          };
          return isQuestionKindForDebugLevel(
            debugLevel,
            buildQuestion(word, payload.words, record, debugSetting).kind,
          );
        });
      });
    if (candidates.length === 0) return;
    setIsDebugPickerOpen(false);
    setPracticeWordIds(null);
    if (level === 'progression') {
      const [wordId] = sampleDebugWordIds(candidates.map((word) => word.id), 1);
      setDebugSession({
        mode: 'progression',
        ...createDebugProgressionPlan(wordId),
      });
    } else {
      setDebugSession({
        mode: 'fixed',
        level: debugLevels[0],
        wordIds: sampleDebugWordIds(candidates.map((word) => word.id)),
      });
    }
    startTransition(() => setRoute('learning'));
  }

  async function handleAdvanceDay() {
    if (!payload || !parentSetting || !task) return;

    const nextDateKey = addDaysToDateKey(task.dateKey, 1);
    let nextTask = await getDailyTask(nextDateKey);
    if (nextTask) {
      nextTask = reconcileTaskCompletion(
        nextTask,
        getAuthoritativeTaskAnswerIds(nextTask, answerEvents),
      );
    } else {
      nextTask = buildDailyTask(
        payload.words,
        recordsById,
        parentSetting,
        createDateTimeForDateKey(nextDateKey),
        selectionById,
      );
    }

    await saveDailyTask(nextTask);
    setTask(nextTask);
    setPracticeWordIds(null);
    setSessionResult(null);
    setRoute('home');
    await refreshRecentTasks();
  }

  function handlePracticeWrongWords() {
    if (!payload) {
      return;
    }

    const validWordIds = new Set(payload.words.map((word) => word.id));
    const nextPracticeWordIds = getWrongPracticeWordIds(answerEvents, 10).filter((wordId) => validWordIds.has(wordId));
    if (nextPracticeWordIds.length === 0) {
      return;
    }

    setPracticeWordIds(nextPracticeWordIds);
    startTransition(() => setRoute('learning'));
  }

  function navigateToMainRoute(nextRoute: MainAppRoute) {
    if (route === nextRoute) return;
    if (mainRouteTransitionTimer.current !== null) {
      window.clearTimeout(mainRouteTransitionTimer.current);
      mainRouteTransitionTimer.current = null;
    }

    if (isMainAppRoute(route)) {
      setPreviousMainRoute(route);
      setMainRouteDirection(getMainRouteDirection(route, nextRoute));
    } else {
      setPreviousMainRoute(null);
    }
    setRoute(nextRoute);
    mainRouteTransitionTimer.current = window.setTimeout(() => {
      setPreviousMainRoute(null);
      mainRouteTransitionTimer.current = null;
    }, 540);
  }

  useEffect(() => () => {
    if (mainRouteTransitionTimer.current !== null) {
      window.clearTimeout(mainRouteTransitionTimer.current);
    }
  }, []);

  function handleOpenSettings() {
    navigateToMainRoute('settings');
  }

  function handleOpenSelection() {
    navigateToMainRoute('selection');
  }

  function handleOpenStats() {
    navigateToMainRoute('stats');
  }

  function handleBackHome() {
    setPracticeWordIds(null);
    setDebugSession(null);
    setIsDebugPickerOpen(false);
    navigateToMainRoute('home');
  }

  function handleBackToDebugPicker() {
    setPracticeWordIds(null);
    setDebugSession(null);
    setIsDebugPickerOpen(true);
    navigateToMainRoute('home');
  }

  async function handleUpdateSetting(nextSetting: ParentSetting): Promise<'synced' | 'pending'> {
    const loadSettingChanged = !parentSetting
      || nextSetting.dailyNewWordCount !== parentSetting.dailyNewWordCount
      || nextSetting.dailyReviewLimit !== parentSetting.dailyReviewLimit;
    const loadSettingIncreased = !parentSetting
      || nextSetting.dailyNewWordCount > parentSetting.dailyNewWordCount
      || nextSetting.dailyReviewLimit > parentSetting.dailyReviewLimit;
    await saveParentSetting(nextSetting);
    setParentSetting(nextSetting);

    if (task && loadSettingChanged) {
      if (!task.completedAt && task.totalAnswered === 0) {
        await rebuildTodayTask(recordsById, nextSetting, selectionById);
      } else if (loadSettingIncreased) {
        await expandCurrentTaskPlan(nextSetting);
      }
    }

    if (!onRequestSync) {
      return 'pending';
    }
    const syncResult = await onRequestSync();
    return syncResult.kind === 'synced' ? 'synced' : 'pending';
  }

  async function handleSelectProfile(profileId: ProfileId) {
    if (!parentSetting || parentSetting.profileId === profileId) return;
    const nextSetting = { ...parentSetting, profileId };
    await saveParentSetting(nextSetting);
    setParentSetting(nextSetting);
  }

  async function handleSaveSelectionStates(states: WordSelectionState[]) {
    await saveWordSelectionStates(states);
    setSelectionById((previous) => {
      const nextSelectionById = { ...previous };
      for (const state of states) {
        nextSelectionById[state.wordId] = state;
      }
      return nextSelectionById;
    });
  }

  async function handleApplySelectionPlan() {
    if (task && !task.completedAt && task.totalAnswered === 0) {
      await rebuildTodayTask(recordsById, parentSetting, selectionById);
    }

    navigateToMainRoute('home');
  }

  async function handleClearLocalData(familyCode: string) {
    const metadata = await getOrCreateSyncMetadata();
    if (!metadata.deviceToken) {
      throw new Error('当前设备尚未连接云端，无法校验家庭验证码。');
    }
    const verification = await verifyFamilyCode(familyCode, metadata.deviceToken);
    if (!verification.valid) {
      throw new Error('家庭验证码不正确。');
    }
    const confirmed = window.confirm('验证码正确。确定只清空这台设备的学习数据和生活照片吗？云端数据不会删除。');
    if (!confirmed) return;
    await clearLocalDeviceData();
    window.location.reload();
  }

  async function handleExportStudyData() {
    if (!parentSetting) {
      return;
    }

    const [learningRecordMap, dailyTasks, wordSelectionMap, answerEvents] = await Promise.all([
      listLearningRecords(),
      listDailyTasks(),
      listWordSelectionStates(),
      listAnswerEvents(),
    ]);
    const exportedAt = new Date().toISOString();
    const exportPayload = buildStudyDataExport({
      exportedAt,
      appVersion: APP_VERSION,
      learningRecords: Object.values(learningRecordMap),
      dailyTasks,
      parentSetting,
      wordSelectionStates: Object.values(wordSelectionMap),
      answerEvents,
    });
    downloadJsonFile(`vocab-rabbit-study-data-${exportedAt.slice(0, 10)}.json`, exportPayload);
  }

  async function handleDownloadPrivateLifePhotos(
    options: PrivateLifePhotoDownloadOptions,
  ): Promise<PrivateLifePhotoDownloadResult> {
    if (!payload) {
      throw new Error('词库尚未加载完成，请稍后再试。');
    }
    const wordIds = payload.words
      .filter((word) => Boolean(word.relatedMedia?.lifePhoto))
      .map((word) => word.id);
    const result = await downloadPrivateLifePhotos(wordIds, options);
    setLocalLifePhotoCount(await countLocalLifePhotos());
    if (result.downloaded > 0) {
      const activeWordIds = task
        ? [...new Set([...task.reviewWordIds, ...task.newWordIds])]
        : [];
      const unloadedWordIds = activeWordIds.filter(
        (wordId) => !localLifePhotoViewsRef.current[wordId],
      );
      const nextLocalLifePhotos = await loadLocalLifePhotoViews(unloadedWordIds);
      setLocalLifePhotosById((current) => addLocalLifePhotoViews(current, nextLocalLifePhotos));
    }
    return result;
  }

  async function handleImportStudyData(file: File): Promise<StudyDataImportResult> {
    if (!payload) {
      throw new Error('词库尚未加载完成，请稍后再试。');
    }

    const backup = await readStudyDataImport(file);
    await replaceStudyData(backup);

    const records = Object.fromEntries(
      backup.tables.learningRecords.map((record) => [record.wordId, record]),
    );
    const importedSelection = Object.fromEntries(
      backup.tables.wordSelectionStates.map((state) => [state.wordId, state]),
    );
    const { nextSelectionById, missingStates } = ensureSelectionStateMap(payload.words, importedSelection);
    if (missingStates.length > 0) {
      await saveWordSelectionStates(missingStates);
    }

    const todayKey = createDateKey();
    let restoredTask = await getDailyTask(todayKey);
    if (!restoredTask) {
      restoredTask = buildDailyTask(
        payload.words,
        records,
        backup.tables.parentSetting,
        new Date(),
        nextSelectionById,
      );
      await saveDailyTask(restoredTask);
    }

    setRecordsById(records);
    setAnswerEvents(backup.tables.answerEvents.slice(-500));
    setSelectionById(nextSelectionById);
    setParentSetting(backup.tables.parentSetting);
    setTask(restoredTask);
    setRecentTasks(await listRecentTasks(90));
    setSessionResult(null);
    setPracticeWordIds(null);

    return {
      learningRecords: backup.tables.learningRecords.length,
      dailyTasks: backup.tables.dailyTasks.length,
      wordSelectionStates: backup.tables.wordSelectionStates.length,
      answerEvents: backup.tables.answerEvents.length,
      exportedAt: backup.exportedAt,
    };
  }

  function renderMainRoute(targetRoute: MainAppRoute) {
    if (!payload || !task || !parentSetting) return null;

    if (targetRoute === 'settings') {
      return (
        <SettingsPage
          settings={parentSetting}
          task={task}
          onBackHome={handleBackHome}
          onOpenSelection={handleOpenSelection}
          onOpenStats={handleOpenStats}
          onUpdateSettings={handleUpdateSetting}
          onSelectProfile={handleSelectProfile}
          onExportStudyData={handleExportStudyData}
          onImportStudyData={handleImportStudyData}
          onClearLocalData={handleClearLocalData}
          onDownloadPrivateLifePhotos={handleDownloadPrivateLifePhotos}
          localLifePhotoCount={localLifePhotoCount}
          words={payload.words}
        />
      );
    }

    if (targetRoute === 'stats') {
      return (
        <StatsPage
          payload={payload}
          task={task}
          recentTasks={recentTasks}
          recordsById={recordsById}
          answerEvents={answerEvents}
          selectionById={selectionById}
          setting={parentSetting}
          onBackHome={handleBackHome}
          onOpenSelection={handleOpenSelection}
          onSelectProfile={handleSelectProfile}
          onPracticeWrongWords={handlePracticeWrongWords}
        />
      );
    }

    if (targetRoute === 'selection') {
      return (
        <SelectionPage
          payload={payload}
          recordsById={recordsById}
          selectionById={selectionById}
          answerEvents={answerEvents}
          setting={parentSetting}
          task={task}
          localLifePhotosById={localLifePhotosById}
          onBackHome={handleBackHome}
          onSelectProfile={handleSelectProfile}
          onOpenStats={handleOpenStats}
          onSaveSelectionStates={handleSaveSelectionStates}
          onApplySelectionPlan={handleApplySelectionPlan}
          onRequestLocalLifePhoto={(wordId) => void ensureLocalLifePhoto(wordId)}
        />
      );
    }

    return (
      <ReviewPage
        payload={payload}
        task={task}
        setting={parentSetting}
        recordsById={recordsById}
        selectionById={selectionById}
        answerEvents={answerEvents}
        masteredCount={masteredCount}
        recentTasks={recentTasks}
        previewWords={previewWords}
        localLifePhotosById={localLifePhotosById}
        debugPickerOpen={isDebugPickerOpen}
        onDebugPickerOpenChange={setIsDebugPickerOpen}
        onStart={handleStart}
        onStartDebug={handleStartDebug}
        onAdvanceDay={handleAdvanceDay}
        onSelectProfile={handleSelectProfile}
        onSaveSelectionStates={handleSaveSelectionStates}
        onRequestLocalLifePhoto={(wordId) => void ensureLocalLifePhoto(wordId)}
      />
    );
  }

  function renderCurrentRoute() {
    if (loading) {
      return (
        <main className="page page--status">
          <section className="status-card">
            <h1>正在准备今天的词汇篮子…</h1>
            <p>先读取词表 JSON，再恢复本地学习记录。</p>
          </section>
        </main>
      );
    }

    if (error || !payload || !task || !parentSetting) {
      return (
        <main className="page page--status">
          <section className="status-card status-card--error">
            <h1>页面初始化失败</h1>
            <p>{error ?? '没有找到词表数据。'}</p>
          </section>
        </main>
      );
    }

    if (route === 'learning') {
      const debugBaseLevel = debugSession?.mode === 'fixed'
        ? debugSession.level
        : debugSession?.levels[0] ?? 0;
      const debugRecords = debugSession
        ? {
            ...recordsById,
            ...Object.fromEntries([...new Set(debugSession.wordIds)].map((wordId) => [
              wordId,
              {
                ...(recordsById[wordId] ?? createEmptyRecord(wordId)),
                masteryLevel: debugBaseLevel,
                reviewStage: debugBaseLevel,
              },
            ])),
          }
        : recordsById;
      const learningSetting = debugSession
        ? { ...parentSetting, showImages: true }
        : parentSetting;
      return (
        <LearningPage
          payload={payload}
          initialWordIds={debugSession ? debugSession.wordIds : practiceWordIds ?? getTaskStudyQueue(task)}
          recordsById={debugRecords}
          answerEvents={answerEvents}
          setting={learningSetting}
          studyDateKey={task.dateKey}
          localLifePhotosById={localLifePhotosById}
          onAnswer={debugSession ? async () => undefined : handleAnswer}
          onComplete={debugSession
            ? async () => handleBackToDebugPicker()
            : handleComplete}
          onExit={debugSession ? handleBackToDebugPicker : handleBackHome}
          debugLevel={debugSession?.mode === 'fixed' ? debugSession.level : null}
          debugLevelSequence={debugSession?.mode === 'progression' ? debugSession.levels : null}
        />
      );
    }

    if (route === 'complete' && sessionResult) {
      return <CompletionPage result={sessionResult} onBackHome={handleBackHome} />;
    }

    const currentMainRoute = isMainAppRoute(route) ? route : 'home';
    const activeDock = currentMainRoute === 'home' ? 'review' : currentMainRoute;
    const isTransitioning = previousMainRoute !== null && previousMainRoute !== currentMainRoute;
    return (
      <>
        <MainShellChrome
          profileId={parentSetting.profileId}
          onSelectProfile={handleSelectProfile}
        />
        <div className="main-route-stage" data-direction={mainRouteDirection}>
          {isTransitioning && (
            <div
              className={`main-route-layer main-route-layer--previous main-route-layer--exit-${mainRouteDirection}`}
              key={previousMainRoute}
              aria-hidden="true"
            >
              {renderMainRoute(previousMainRoute)}
            </div>
          )}
          <div
            className={`main-route-layer main-route-layer--current${isTransitioning ? ` main-route-layer--enter-${mainRouteDirection}` : ''}`}
            key={currentMainRoute}
          >
            {renderMainRoute(currentMainRoute)}
          </div>
        </div>
        <BottomDock
          active={activeDock}
          onOpenReview={handleBackHome}
          onOpenSelection={handleOpenSelection}
          onOpenStats={handleOpenStats}
          onOpenSettings={handleOpenSettings}
        />
      </>
    );
  }

  return <div className="ipad-stage-shell">{renderCurrentRoute()}</div>;
}
