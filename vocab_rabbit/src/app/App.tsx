import { startTransition, useEffect, useMemo, useState } from 'react';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary, SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoView } from '../models/local-media';
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
import { buildDailyTask, createDateKey, recordTaskAnswer } from '../services/task-service';
import { getWrongPracticeWordIds } from '../services/answer-event-service';
import { ensureSelectionStateMap } from '../services/selection-service';
import { createEmptyRecord, evaluateAnswer, isMastered } from '../services/spaced-repetition';
import {
  clearStudyData,
  getDailyTask,
  getParentSetting,
  listAnswerEvents,
  listDailyTasks,
  listLearningRecords,
  listRecentTasks,
  listWordSelectionStates,
  replaceStudyData,
  saveAnswerEvent,
  saveDailyTask,
  saveLearningRecord,
  saveParentSetting,
  saveWordSelectionStates,
} from '../services/storage-service';
import { buildStudyDataExport, downloadJsonFile } from '../services/study-data-export';
import {
  readStudyDataImport,
  type StudyDataImportResult,
} from '../services/study-data-import';
import {
  importLifePhotoPackage,
  loadLocalLifePhotoViews,
  revokeLocalLifePhotoViews,
  type LifePhotoImportResult,
} from '../services/local-media-service';
import { loadWordPayload } from '../services/word-service';
import { APP_VERSION } from '../config/app-meta';
import { BottomDock } from '../components/BottomDock';

function getPreviewWords(payload: WordPayload | null, task: DailyTaskSummary | null) {
  if (!payload || !task) {
    return [];
  }

  const wordIds = [...task.newWordIds, ...task.reviewWordIds].slice(0, 4);
  const wordsById = new Map(payload.words.map((word) => [word.id, word]));
  return wordIds.map((wordId) => wordsById.get(wordId)).filter(Boolean) as WordPayload['words'];
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>('home');
  const [payload, setPayload] = useState<WordPayload | null>(null);
  const [recordsById, setRecordsById] = useState<Record<string, LearningRecord>>({});
  const [answerEvents, setAnswerEvents] = useState<AnswerEvent[]>([]);
  const [selectionById, setSelectionById] = useState<Record<string, WordSelectionState>>({});
  const [localLifePhotosById, setLocalLifePhotosById] = useState<Record<string, LocalLifePhotoView>>({});
  const [parentSetting, setParentSetting] = useState<ParentSetting | null>(null);
  const [task, setTask] = useState<DailyTaskSummary | null>(null);
  const [practiceWordIds, setPracticeWordIds] = useState<string[] | null>(null);
  const [recentTasks, setRecentTasks] = useState<DailyTaskSummary[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setLoading(true);
        const [
          payloadValue,
          savedRecords,
          savedSetting,
          savedSelection,
          savedAnswerEvents,
          savedLocalLifePhotos,
        ] = await Promise.all([
          loadWordPayload(),
          listLearningRecords(),
          getParentSetting(),
          listWordSelectionStates(),
          listAnswerEvents(500),
          loadLocalLifePhotoViews(),
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
          setAnswerEvents(savedAnswerEvents);
          setSelectionById(nextSelectionById);
          setLocalLifePhotosById(savedLocalLifePhotos);
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
    return () => {
      revokeLocalLifePhotoViews(localLifePhotosById);
    };
  }, [localLifePhotosById]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    function syncShellState() {
      const shouldLockIpadShell = true;
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
  }, []);

  const previewWords = useMemo(() => getPreviewWords(payload, task), [payload, task]);
  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => isMastered(record)).length,
    [recordsById]
  );
  const localLifePhotoImportedAt = useMemo(() => {
    const importedTimes = Object.values(localLifePhotosById)
      .map((photo) => photo.importedAt)
      .filter(Boolean)
      .sort();
    return importedTimes.at(-1) ?? null;
  }, [localLifePhotosById]);

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

  async function handleAnswer(event: AnswerEvent) {
    const currentRecord = recordsById[event.wordId] ?? createEmptyRecord(event.wordId);
    const nextRecord = evaluateAnswer(currentRecord, event.isCorrect, new Date(event.answeredAt));
    await Promise.all([
      saveLearningRecord(nextRecord),
      saveAnswerEvent(event),
    ]);
    setAnswerEvents((previous) => [...previous.slice(-499), event]);

    if (!practiceWordIds && task && !task.completedAt) {
      const nextTask = recordTaskAnswer(task, event.isCorrect, event.wordId);
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

    const completedTask: DailyTaskSummary = {
      ...task,
      completedAt: new Date().toISOString(),
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      totalAnswered: result.totalAnswered,
      answeredWordIds: [...new Set([...task.answeredWordIds, ...task.newWordIds, ...task.reviewWordIds])],
    };

    await saveDailyTask(completedTask);
    setTask(completedTask);
    setSessionResult(result);
    await refreshRecentTasks();
    startTransition(() => setRoute('complete'));
  }

  function handleStart() {
    setPracticeWordIds(null);
    startTransition(() => setRoute('learning'));
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
    setPracticeWordIds(null);
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
    setAnswerEvents([]);
    setTask(nextTask);
    setSessionResult(null);
    await refreshRecentTasks();
    startTransition(() => setRoute('home'));
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

  async function handleImportLifePhotoPackage(file: File): Promise<LifePhotoImportResult> {
    const result = await importLifePhotoPackage(file);
    const nextLocalLifePhotos = await loadLocalLifePhotoViews();
    setLocalLifePhotosById(nextLocalLifePhotos);
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
    setRecentTasks(await listRecentTasks(14));
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
      const dailyWordIds = [...task.newWordIds, ...task.reviewWordIds];
      const remainingDailyWordIds = task.completedAt
        ? dailyWordIds
        : dailyWordIds.filter((wordId) => !task.answeredWordIds.includes(wordId));
      return (
        <LearningPage
          payload={payload}
          initialWordIds={practiceWordIds ?? remainingDailyWordIds}
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
        <>
          <SettingsPage
            settings={parentSetting}
            task={task}
            onBackHome={handleBackHome}
            onOpenSelection={handleOpenSelection}
            onOpenStats={handleOpenStats}
            onUpdateSettings={handleUpdateSetting}
            onExportStudyData={handleExportStudyData}
            onImportStudyData={handleImportStudyData}
            onResetTodayTask={handleResetTodayTask}
            onResetLearningProgress={handleResetLearningProgress}
            onImportLifePhotoPackage={handleImportLifePhotoPackage}
            localLifePhotoCount={Object.keys(localLifePhotosById).length}
            localLifePhotoImportedAt={localLifePhotoImportedAt}
          />
          <BottomDock
            active="settings"
            onOpenReview={handleBackHome}
            onOpenSelection={handleOpenSelection}
            onOpenStats={handleOpenStats}
            onOpenSettings={handleOpenSettings}
          />
        </>
      );
    }

    if (route === 'stats') {
      return (
        <>
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
            onOpenSettings={handleOpenSettings}
            onPracticeWrongWords={handlePracticeWrongWords}
          />
          <BottomDock
            active="stats"
            onOpenReview={handleBackHome}
            onOpenSelection={handleOpenSelection}
            onOpenStats={handleOpenStats}
            onOpenSettings={handleOpenSettings}
          />
        </>
      );
    }

    if (route === 'selection') {
      return (
        <>
          <SelectionPage
            payload={payload}
            recordsById={recordsById}
            selectionById={selectionById}
            answerEvents={answerEvents}
            setting={parentSetting}
            task={task}
            localLifePhotosById={localLifePhotosById}
            onBackHome={handleBackHome}
            onOpenSettings={handleOpenSettings}
            onOpenStats={handleOpenStats}
            onSaveSelectionStates={handleSaveSelectionStates}
            onApplySelectionPlan={handleApplySelectionPlan}
          />
          <BottomDock
            active="selection"
            onOpenReview={handleBackHome}
            onOpenSelection={handleOpenSelection}
            onOpenStats={handleOpenStats}
            onOpenSettings={handleOpenSettings}
          />
        </>
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
