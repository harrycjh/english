import { startTransition, useEffect, useMemo, useState } from 'react';
import type { DailyTaskSummary, SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { WordPayload } from '../models/word';
import type { AppRoute } from './routes';
import { CompletionPage } from '../screens/CompletionPage';
import { HomePage } from '../screens/HomePage';
import { LearningPage } from '../screens/LearningPage';
import { buildDailyTask, createDateKey } from '../services/task-service';
import { createEmptyRecord, evaluateAnswer, isMastered } from '../services/spaced-repetition';
import {
  getDailyTask,
  listLearningRecords,
  listRecentTasks,
  saveDailyTask,
  saveLearningRecord,
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

export default function App() {
  const [route, setRoute] = useState<AppRoute>('home');
  const [payload, setPayload] = useState<WordPayload | null>(null);
  const [recordsById, setRecordsById] = useState<Record<string, LearningRecord>>({});
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
        const [payloadValue, savedRecords] = await Promise.all([loadWordPayload(), listLearningRecords()]);
        const todayKey = createDateKey();

        let todayTask = await getDailyTask(todayKey);
        if (!todayTask) {
          todayTask = buildDailyTask(payloadValue.words, savedRecords, new Date());
          await saveDailyTask(todayTask);
        }

        const history = await listRecentTasks(14);

        if (!cancelled) {
          setPayload(payloadValue);
          setRecordsById(savedRecords);
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

  const previewWords = useMemo(() => getPreviewWords(payload, task), [payload, task]);
  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => isMastered(record)).length,
    [recordsById]
  );

  async function refreshRecentTasks() {
    setRecentTasks(await listRecentTasks(14));
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

  function handleBackHome() {
    startTransition(() => setRoute('home'));
  }

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

  if (error || !payload || !task) {
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
        onAnswer={handleAnswer}
        onComplete={handleComplete}
        onExit={handleBackHome}
      />
    );
  }

  if (route === 'complete' && sessionResult) {
    return <CompletionPage result={sessionResult} onBackHome={handleBackHome} />;
  }

  return (
    <HomePage
      payload={payload}
      task={task}
      masteredCount={masteredCount}
      recentTasks={recentTasks}
      previewWords={previewWords}
      onStart={handleStart}
    />
  );
}