import { useEffect, useMemo, useState } from 'react';
import type { AnswerEvent } from '../models/answer-event';
import type { SessionResult } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoView } from '../models/local-media';
import type { ParentSetting } from '../models/parent-setting';
import type { WordPayload } from '../models/word';
import { ProgressRing } from '../components/ProgressRing';
import { QuestionFillBlank } from '../components/QuestionFillBlank';
import { QuestionImage } from '../components/QuestionImage';
import { QuestionImageAnswer } from '../components/QuestionImageAnswer';
import { QuestionRecognition } from '../components/QuestionRecognition';
import { QuestionText } from '../components/QuestionText';
import { buildQuestion, getCorrectAnswer, isCorrectAnswer, type Question } from '../services/question-service';
import { createAnswerEventId } from '../services/answer-event-service';
import { getExampleSentences } from '../services/example-service';
import { createEmptyRecord } from '../services/spaced-repetition';
import { createDateTimeForDateKey } from '../services/task-service';
import { indexWordsById } from '../services/word-service';

interface LearningPageProps {
  payload: WordPayload;
  initialWordIds: string[];
  recordsById: Record<string, LearningRecord>;
  setting: ParentSetting;
  studyDateKey: string;
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  onAnswer: (event: AnswerEvent) => Promise<void>;
  onComplete: (result: SessionResult) => Promise<void>;
  onExit: () => void;
}

export function LearningPage({
  payload,
  initialWordIds,
  recordsById,
  setting,
  studyDateKey,
  localLifePhotosById,
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
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now());

  const currentWordId = queue[currentIndex];
  const currentWord = currentWordId ? wordsById.get(currentWordId) : undefined;
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(() => {
    if (!currentWordId || !currentWord) {
      return null;
    }

    return buildQuestion(currentWord, payload.words, recordsById[currentWordId] ?? createEmptyRecord(currentWordId), setting);
  });

  useEffect(() => {
    if (!currentWordId || !currentWord) {
      setCurrentQuestion(null);
      return;
    }

    // Freeze one generated question per queue slot so rerenders do not reshuffle options.
    setCurrentQuestion(
      buildQuestion(currentWord, payload.words, recordsById[currentWordId] ?? createEmptyRecord(currentWordId), setting)
    );
    setQuestionStartedAt(Date.now());
  }, [currentIndex, currentWordId, currentWord, payload.words]);

  async function handleAnswer(answer: string) {
    if (!currentWordId || !currentQuestion || isLocked) {
      return;
    }

    const correct = isCorrectAnswer(currentQuestion, answer);
    const correctAnswer = getCorrectAnswer(currentQuestion);
    const learningAction = currentQuestion.kind === 'recognition'
      ? answer === '认识' ? 'recognized' : 'unknown'
      : 'answer';
    const answeredAt = createDateTimeForDateKey(studyDateKey);
    const answeredAtText = answeredAt.toISOString();
    const answerEvent: AnswerEvent = {
      id: createAnswerEventId(currentWordId, answeredAtText),
      wordId: currentWordId,
      dateKey: studyDateKey,
      answeredAt: answeredAtText,
      questionKind: currentQuestion.kind,
      selectedAnswer: answer,
      correctAnswer,
      isCorrect: correct,
      responseTimeMs: Math.max(0, Date.now() - questionStartedAt),
      learningAction,
      isSessionRetry: (repeatCounts[currentWordId] ?? 0) > 0,
    };
    const currentRepeatCount = repeatCounts[currentWordId] ?? 0;
    const shouldRepeat = !correct;
    const nextQueueLength = queue.length + (shouldRepeat ? 1 : 0);
    const nextIndex = currentIndex + 1;

    setIsLocked(true);
    setSelectedAnswer(answer);
    setFeedbackText(
      correct
        ? '答对了，继续前进。'
        : currentQuestion.kind === 'recognition'
          ? '没关系，稍后再练一次。'
          : `正确答案：${correctAnswer}`,
    );
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

    await onAnswer(answerEvent);

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

  async function handleAllCorrect() {
    if (!currentWordId || !currentQuestion || isLocked) return;

    const remainingWordIds = [...new Set(queue.slice(currentIndex))];
    const startedAt = Date.now();
    setIsLocked(true);
    setFeedbackText(`正在将剩余 ${remainingWordIds.length} 个单词记为答对…`);

    try {
      for (const [index, wordId] of remainingWordIds.entries()) {
        const word = wordsById.get(wordId);
        if (!word) continue;
        const question = wordId === currentWordId
          ? currentQuestion
          : buildQuestion(
            word,
            payload.words,
            recordsById[wordId] ?? createEmptyRecord(wordId),
            setting,
          );
        const correctAnswer = getCorrectAnswer(question);
        const answeredAt = createDateTimeForDateKey(
          studyDateKey,
          new Date(startedAt + index * 1_000),
        );
        const answeredAtText = answeredAt.toISOString();
        await onAnswer({
          id: createAnswerEventId(wordId, answeredAtText),
          wordId,
          dateKey: studyDateKey,
          answeredAt: answeredAtText,
          questionKind: question.kind,
          selectedAnswer: correctAnswer,
          correctAnswer,
          isCorrect: true,
          responseTimeMs: index === 0 ? Math.max(0, Date.now() - questionStartedAt) : 0,
          learningAction: question.kind === 'recognition' ? 'recognized' : 'answer',
          isSessionRetry: (repeatCounts[wordId] ?? 0) > 0,
        });
      }

      const finalResult = {
        totalAnswered: sessionResult.totalAnswered + remainingWordIds.length,
        correctCount: sessionResult.correctCount + remainingWordIds.length,
        wrongCount: sessionResult.wrongCount,
      };
      setSessionResult(finalResult);
      await onComplete(finalResult);
    } finally {
      setIsLocked(false);
    }
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

  const exampleSentences = setting.showExamples ? getExampleSentences(currentWord).slice(0, 1) : [];

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
            {setting.profileId === 'stinky-dog' ? (
              <div className="learning-header__actions">
                <button
                  className="learning-direct-correct"
                  type="button"
                  disabled={isLocked}
                  onClick={() => void handleAnswer(getCorrectAnswer(currentQuestion))}
                >
                  直接答对
                </button>
                <button
                  className="learning-direct-correct learning-direct-correct--all"
                  type="button"
                  disabled={isLocked}
                  onClick={() => void handleAllCorrect()}
                >
                  全部答对
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {currentQuestion.kind === 'image-choice' ? (
          <QuestionImage
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            selectedAnswer={selectedAnswer}
            localLifePhoto={localLifePhotosById[currentWord.id]}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'recognition' ? (
          <QuestionRecognition
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            selectedAnswer={selectedAnswer}
            localLifePhoto={localLifePhotosById[currentWord.id]}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'image-answer-choice' ? (
          <QuestionImageAnswer
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            selectedAnswer={selectedAnswer}
            localLifePhotosById={localLifePhotosById}
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
            showHints={setting.showHints}
            onSubmit={handleAnswer}
          />
        ) : null}

        {exampleSentences.length > 0 ? (
          <section className="learning-example-panel" aria-label="例句">
            <span>例句</span>
            <p>{exampleSentences[0]}</p>
          </section>
        ) : null}

        <footer className={`feedback-strip${feedbackText ? ' is-visible' : ''}`}>
          {feedbackText ?? '选择答案后会自动进入下一题'}
        </footer>
      </section>
    </main>
  );
}
