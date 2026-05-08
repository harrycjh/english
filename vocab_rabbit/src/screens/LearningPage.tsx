import { useEffect, useMemo, useState } from 'react';
import type { SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordPayload } from '../models/word';
import { ProgressRing } from '../components/ProgressRing';
import { QuestionFillBlank } from '../components/QuestionFillBlank';
import { QuestionImage } from '../components/QuestionImage';
import { QuestionText } from '../components/QuestionText';
import { buildQuestion, getCorrectAnswer, isCorrectAnswer, type Question } from '../services/question-service';
import { createEmptyRecord } from '../services/spaced-repetition';
import { indexWordsById } from '../services/word-service';

interface LearningPageProps {
  payload: WordPayload;
  initialWordIds: string[];
  recordsById: Record<string, LearningRecord>;
  setting: ParentSetting;
  onAnswer: (wordId: string, isCorrect: boolean) => Promise<void>;
  onComplete: (result: SessionResult) => Promise<void>;
  onExit: () => void;
}

export function LearningPage({
  payload,
  initialWordIds,
  recordsById,
  setting,
  onAnswer,
  onComplete,
  onExit,
}: LearningPageProps) {
  const wordsById = useMemo(() => indexWordsById(payload.words), [payload.words]);
  const [queue, setQueue] = useState(initialWordIds);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});
  const [sessionResult, setSessionResult] = useState<SessionResult>({
    totalAnswered: 0,
    correctCount: 0,
    wrongCount: 0,
  });
  const [isLocked, setIsLocked] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);

  const currentWordId = queue[currentIndex];
  const currentWord = currentWordId ? wordsById.get(currentWordId) : undefined;
  const currentRecord = currentWordId ? recordsById[currentWordId] ?? createEmptyRecord(currentWordId) : undefined;
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(() =>
    currentWord ? buildQuestion(currentWord, payload.words, currentRecord, setting) : null
  );

  useEffect(() => {
    setCurrentQuestion(currentWord ? buildQuestion(currentWord, payload.words, currentRecord, setting) : null);
  }, [currentIndex, currentWord, payload.words, currentRecord, setting]);

  async function handleAnswer(answer: string) {
    if (!currentWordId || !currentQuestion || isLocked) {
      return;
    }

    const correct = isCorrectAnswer(currentQuestion, answer);
    const correctAnswer = getCorrectAnswer(currentQuestion);
    const currentRepeatCount = repeatCounts[currentWordId] ?? 0;
    const shouldRepeat = !correct && currentRepeatCount < 2;
    const nextQueueLength = queue.length + (shouldRepeat ? 1 : 0);
    const nextIndex = currentIndex + 1;

    setIsLocked(true);
    setSelectedAnswer(answer);
    setFeedbackText(correct ? '答对了，继续前进。' : `正确答案：${correctAnswer}`);
    setSessionResult((previous) => ({
      totalAnswered: previous.totalAnswered + 1,
      correctCount: previous.correctCount + (correct ? 1 : 0),
      wrongCount: previous.wrongCount + (correct ? 0 : 1),
    }));

    if (shouldRepeat) {
      setRepeatCounts((previous) => ({
        ...previous,
        [currentWordId]: currentRepeatCount + 1,
      }));
      setQueue((previous) => [...previous, currentWordId]);
    }

    await onAnswer(currentWordId, correct);

    window.setTimeout(async () => {
      setSelectedAnswer(null);
      setFeedbackText(null);
      setIsLocked(false);

      if (nextIndex >= nextQueueLength) {
        const finalResult = {
          totalAnswered: sessionResult.totalAnswered + 1,
          correctCount: sessionResult.correctCount + (correct ? 1 : 0),
          wrongCount: sessionResult.wrongCount + (correct ? 0 : 1),
        };
        await onComplete(finalResult);
        return;
      }

      setCurrentIndex(nextIndex);
    }, 700);
  }

  if (!currentWord || !currentQuestion) {
    return (
      <main className="page page--learn">
        <section className="empty-state">
          <h2>今天没有可学习的词。</h2>
          <button className="secondary-button" type="button" onClick={onExit}>
            返回首页
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page page--learn">
      <section className="learning-shell">
        <header className="learning-header">
          <button className="secondary-button" type="button" onClick={onExit}>
            返回首页
          </button>
          <ProgressRing value={currentIndex + 1} total={queue.length} />
          <div className="learning-header__meta">
            <span>{currentWord.category}</span>
            <strong>{currentWord.chinese}</strong>
          </div>
        </header>

        {currentQuestion.kind === 'image-choice' ? (
          <QuestionImage
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            selectedAnswer={selectedAnswer}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'text-choice' ? (
          <QuestionText
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            selectedAnswer={selectedAnswer}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'fill-blank' ? (
          <QuestionFillBlank
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            onSubmit={handleAnswer}
          />
        ) : null}

        <footer className={`feedback-strip${feedbackText ? ' is-visible' : ''}`}>
          {feedbackText ?? '选择答案后会自动进入下一题'}
        </footer>
      </section>
    </main>
  );
}