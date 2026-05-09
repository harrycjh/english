import { startTransition, useEffect, useMemo, useState } from 'react';
import type { DailyTaskSummary, SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import type { AppRoute } from './routes';
import { CompletionPage } from '../screens/CompletionPage';
import { ReviewPage } from '../screens/HomePage';
import { LearningPage } from '../screens/LearningPage';
import { SelectionPage } from '../screens/SelectionPage';
import { StatsPage } from '../screens/StatsPage';
import { SettingsPage } from '../screens/SettingsPage';
import { buildDailyTask, createDateKey } from '../services/task-service';
import { ensureSelectionStateMap } from '../services/selection-service';
import { createEmptyRecord, evaluateAnswer, isMastered } from '../services/spaced-repetition';
import {
  clearStudyData,
  getDailyTask,
  getParentSetting,
  listLearningRecords,
  listRecentTasks,
  listWordSelectionStates,
  saveDailyTask,
  saveLearningRecord,
  saveParentSetting,
  saveWordSelectionStates,
} from '../services/storage-service';
import { loadWordPayload } from '../services/word-service';

function getPreviewWords(payload: WordPayload | null, task: DailyTaskSummary | null) {
  if (!payload || !task) {
    return [];
  }

  const wordIds = [...task.newWordIds, ...task.reviewWordIds].slice(0, 4);
  const wordsById = new Map(payload.words.map((word) => [word.id, word]));
  return wordIds.map((wordId) => wordsById.get(wordId)).filter(Boolean) as WordPayload['words'];
}

function isIpadFamilyDevice() {
  if (typeof window === 'undefined') {
    return false;
  }

  const platform = window.navigator.platform ?? '';
  const hasTouch = window.navigator.maxTouchPoints > 1;
  return /iPad/i.test(window.navigator.userAgent) || (platform === 'MacIntel' && hasTouch);
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>('home');
  const [payload, setPayload] = useState<WordPayload | null>(null);
  const [recordsById, setRecordsById] = useState<Record<string, LearningRecord>>({});
  const [selectionById, setSelectionById] = useState<Record<string, WordSelectionState>>({});
  const [parentSetting, setParentSetting] = useState<ParentSetting | null>(null);
  const [task, setTask] = useState<DailyTaskSummary | null>(null);
  const [recentTasks, setRecentTasks] = useState<DailyTaskSummary[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        const [payloadValue, savedRecords, savedSetting, savedSelection] = await Promise.all([
          loadWordPayload(),
          listLearningRecords(),
          getParentSetting(),
          listWordSelectionStates(),
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
        }

        const history = await listRecentTasks(14);

        if (!cancelled) {
          setPayload(payloadValue);
          setRecordsById(savedRecords);
          setSelectionById(nextSelectionById);
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
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    function syncShellState() {
      const shouldLockIpadShell = isIpadFamilyDevice() && (parentSetting?.preferLandscape ?? true);
      const orientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
      const shellMode = shouldLockIpadShell ? 'ipad-fixed' : 'fluid';

      root.dataset.shellMode = shellMode;
      root.dataset.orientation = orientation;
      body.dataset.shellMode = shellMode;
      body.dataset.orientation = orientation;
    }

    syncShellState();
    window.addEventListener('resize', syncShellState);
    window.addEventListener('orientationchange', syncShellState);

    return () => {
      window.removeEventListener('resize', syncShellState);
      window.removeEventListener('orientationchange', syncShellState);
      delete root.dataset.shellMode;
      delete root.dataset.orientation;
      delete body.dataset.shellMode;
      delete body.dataset.orientation;
    };
  }, [parentSetting?.preferLandscape]);

  const previewWords = useMemo(() => getPreviewWords(payload, task), [payload, task]);
  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => isMastered(record)).length,
    [recordsById]
  );

  async function refreshRecentTasks() {
    setRecentTasks(await listRecentTasks(14));
  }

  async function rebuildTodayTask(
    nextRecords: Record<string, LearningRecord> = recordsById,
    nextSetting: ParentSetting | null = parentSetting,
    nextSelection: Record<string, WordSelectionState> = selectionById
  ) {
    if (!payload || !nextSetting) {
      return;
    }

    const nextTask = buildDailyTask(payload.words, nextRecords, nextSetting, new Date(), nextSelection);
    await saveDailyTask(nextTask);
    setTask(nextTask);
    await refreshRecentTasks();
  }

  async function handleAnswer(wordId: string, isCorrect: boolean) {
    const currentRecord = recordsById[wordId] ?? createEmptyRecord(wordId);
    const nextRecord = evaluateAnswer(currentRecord, isCorrect, new Date());
    await saveLearningRecord(nextRecord);
    setRecordsById((previous) => ({
      ...previous,
      [wordId]: nextRecord,
    }));
  }

  async function handleComplete(result: SessionResult) {
    if (!task) {
      return;
    }

    const completedTask: DailyTaskSummary = {
      ...task,
      completedAt: new Date().toISOString(),
      correctCount: result.correctCount,
      totalAnswered: result.totalAnswered,
    };

    await saveDailyTask(completedTask);
    setTask(completedTask);
    setSessionResult(result);
    await refreshRecentTasks();
    startTransition(() => setRoute('complete'));
  }

  function handleStart() {
    startTransition(() => setRoute('learning'));
  }

  function handleOpenSettings() {
    startTransition(() => setRoute('settings'));
  }

  function handleOpenSelection() {
    startTransition(() => setRoute('selection'));
  }

  function handleOpenStats() {
    startTransition(() => setRoute('stats'));
  }

  function handleBackHome() {
    startTransition(() => setRoute('home'));
  }

  async function handleUpdateSetting(nextSetting: ParentSetting) {
    await saveParentSetting(nextSetting);
    setParentSetting(nextSetting);

    if (task && !task.completedAt && task.totalAnswered === 0) {
      await rebuildTodayTask(recordsById, nextSetting, selectionById);
    }
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

    startTransition(() => setRoute('home'));
  }

  async function handleResetTodayTask() {
    setSessionResult(null);
    await rebuildTodayTask();
    startTransition(() => setRoute('home'));
  }

  async function handleResetLearningProgress() {
    if (!payload || !parentSetting) {
      return;
    }

    await clearStudyData();
    const nextRecords: Record<string, LearningRecord> = {};
    const nextTask = buildDailyTask(payload.words, nextRecords, parentSetting, new Date(), selectionById);
    await saveDailyTask(nextTask);

    setRecordsById(nextRecords);
    setTask(nextTask);
    setSessionResult(null);
    await refreshRecentTasks();
    startTransition(() => setRoute('home'));
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
      return (
        <LearningPage
          payload={payload}
          initialWordIds={[...task.newWordIds, ...task.reviewWordIds]}
          recordsById={recordsById}
          setting={parentSetting}
          onAnswer={handleAnswer}
          onComplete={handleComplete}
          onExit={handleBackHome}
        />
      );
    }

    if (route === 'complete' && sessionResult) {
      return <CompletionPage result={sessionResult} onBackHome={handleBackHome} />;
    }

    if (route === 'settings') {
      return (
        <SettingsPage
          settings={parentSetting}
          task={task}
          onBackHome={handleBackHome}
          onOpenSelection={handleOpenSelection}
          onOpenStats={handleOpenStats}
          onUpdateSettings={handleUpdateSetting}
          onResetTodayTask={handleResetTodayTask}
          onResetLearningProgress={handleResetLearningProgress}
        />
      );
    }

    if (route === 'stats') {
      return (
        <StatsPage
          payload={payload}
          task={task}
          recentTasks={recentTasks}
          recordsById={recordsById}
          selectionById={selectionById}
          setting={parentSetting}
          onBackHome={handleBackHome}
          onOpenSelection={handleOpenSelection}
          onOpenSettings={handleOpenSettings}
        />
      );
    }

    if (route === 'selection') {
      return (
        <SelectionPage
          payload={payload}
          recordsById={recordsById}
          selectionById={selectionById}
          setting={parentSetting}
          task={task}
          onBackHome={handleBackHome}
          onOpenSettings={handleOpenSettings}
          onOpenStats={handleOpenStats}
          onSaveSelectionStates={handleSaveSelectionStates}
          onApplySelectionPlan={handleApplySelectionPlan}
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
        masteredCount={masteredCount}
        recentTasks={recentTasks}
        previewWords={previewWords}
        onStart={handleStart}
        onOpenSelection={handleOpenSelection}
        onOpenStats={handleOpenStats}
        onOpenSettings={handleOpenSettings}
        onSaveSelectionStates={handleSaveSelectionStates}
      />
    );
  }

  return renderCurrentRoute();
}