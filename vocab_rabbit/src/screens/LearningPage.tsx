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
import { QuestionLetterChoice } from '../components/QuestionLetterChoice';
import { QuestionRecognition } from '../components/QuestionRecognition';
import { QuestionSentenceChoice } from '../components/QuestionSentenceChoice';
import { QuestionText } from '../components/QuestionText';
import { playLevelUpSound, speakSequence, stopSpeaking } from '../services/audio-service';
import { buildQuestion, getCorrectAnswer, isCorrectAnswer, type Question } from '../services/question-service';
import { createAnswerEventId } from '../services/answer-event-service';
import { createEmptyRecord } from '../services/spaced-repetition';
import { createDateTimeForDateKey } from '../services/task-service';
import { getStudyAudioPlan, splitRelatedResultAudio } from '../services/study-audio-plan';
import { indexWordsById } from '../services/word-service';
import {
  AFTER_LEVEL_UP_ADVANCE_DELAY_MS,
  getLearningAnswerFlow,
  getLifePhotoRevealFlow,
  getUpgradeWaitSegments,
  LEVEL_UP_ANIMATION_MS,
} from './learning-answer-flow';

interface LearningPageProps {
  payload: WordPayload;
  initialWordIds: string[];
  recordsById: Record<string, LearningRecord>;
  answerEvents?: AnswerEvent[];
  setting: ParentSetting;
  studyDateKey: string;
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  onAnswer: (event: AnswerEvent) => Promise<void>;
  onComplete: (result: SessionResult) => Promise<void>;
  onExit: () => void;
  debugLevel?: number | null;
  debugLevelSequence?: number[] | null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function getAnswerFeedbackText(
  _question: Question,
  _questionLevel: number,
  _correct: boolean,
  _feedbackCorrectAnswer: string,
): string | null {
  return null;
}

export function hasTodayWrongDifficultSpellingAttempt(
  answerEvents: AnswerEvent[],
  wordId: string,
  studyDateKey: string,
  questionLevel: number,
): boolean {
  return answerEvents.some((event) => {
    const eventLevel = event.learningStateBefore?.masteryLevel ?? questionLevel;
    return (
      event.wordId === wordId
      && event.dateKey === studyDateKey
      && event.questionKind === 'fill-blank'
      && !event.isCorrect
      && eventLevel >= 8
      && eventLevel <= 9
    );
  });
}

export function LearningPage({
  payload,
  initialWordIds,
  recordsById,
  answerEvents = [],
  setting,
  studyDateKey,
  localLifePhotosById,
  onAnswer,
  onComplete,
  onExit,
  debugLevel = null,
  debugLevelSequence = null,
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
  const [revealLifePhoto, setRevealLifePhoto] = useState(false);
  const [upgradeToLevel, setUpgradeToLevel] = useState<number | null>(null);
  const [relatedResultPhase, setRelatedResultPhase] = useState<'idle' | 'fading-out' | 'revealed'>('idle');
  const [pendingAdvance, setPendingAdvance] = useState<{
    nextIndex: number;
    nextQueueLength: number;
    finalResult: SessionResult;
  } | null>(null);

  const currentWordId = queue[currentIndex];
  const currentWord = currentWordId ? wordsById.get(currentWordId) : undefined;
  const currentRepeatCount = currentWordId ? repeatCounts[currentWordId] ?? 0 : 0;
  const activeDebugLevel = debugLevelSequence?.[currentIndex] ?? debugLevel;
  const isDebugSession = activeDebugLevel !== null;
  const isDebugProgression = debugLevelSequence !== null;
  const [questionLevel, setQuestionLevel] = useState(() => {
    if (activeDebugLevel !== null) return activeDebugLevel;
    return currentWordId ? recordsById[currentWordId]?.masteryLevel ?? 0 : 0;
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(() => {
    if (!currentWordId || !currentWord) {
      return null;
    }

    const record = recordsById[currentWordId] ?? createEmptyRecord(currentWordId);
    const effectiveRecord = activeDebugLevel === null
      ? record
      : { ...record, masteryLevel: activeDebugLevel, reviewStage: activeDebugLevel };
    return buildQuestion(currentWord, payload.words, effectiveRecord, setting);
  });

  useEffect(() => {
    if (!currentWordId || !currentWord) {
      setCurrentQuestion(null);
      return;
    }

    // Freeze one generated question per queue slot so rerenders do not reshuffle options.
    const record = recordsById[currentWordId] ?? createEmptyRecord(currentWordId);
    const effectiveRecord = activeDebugLevel === null
      ? record
      : { ...record, masteryLevel: activeDebugLevel, reviewStage: activeDebugLevel };
    setCurrentQuestion(buildQuestion(currentWord, payload.words, effectiveRecord, setting));
    setQuestionLevel(effectiveRecord.masteryLevel);
    setRevealLifePhoto(false);
    setUpgradeToLevel(null);
    setRelatedResultPhase('idle');
    setPendingAdvance(null);
    setQuestionStartedAt(Date.now());
  }, [currentIndex, currentWordId, currentWord, activeDebugLevel, payload.words]);

  function resetAnswerUi() {
    setSelectedAnswer(null);
    setFeedbackText(null);
    setRevealLifePhoto(false);
    setUpgradeToLevel(null);
    setRelatedResultPhase('idle');
    setPendingAdvance(null);
  }

  async function advanceQuestion(
    nextIndex: number,
    nextQueueLength: number,
    finalResult: SessionResult,
  ) {
    resetAnswerUi();
    setIsLocked(false);
    if (nextIndex >= nextQueueLength) {
      await onComplete(finalResult);
      return;
    }
    setCurrentIndex(nextIndex);
  }

  async function playUpgradeCue(upgradeLevel: number | null, durationMs: number) {
    if (upgradeLevel === null || durationMs <= 0) return;
    setUpgradeToLevel(upgradeLevel);
    if (setting.enableAudio) playLevelUpSound();
    await wait(durationMs);
  }

  async function waitAfterUpgrade(upgradeLevel: number | null) {
    if (upgradeLevel !== null) await wait(AFTER_LEVEL_UP_ADVANCE_DELAY_MS);
  }

  async function waitWithFinalUpgrade(totalWaitMs: number, upgradeLevel: number | null) {
    const segments = getUpgradeWaitSegments(totalWaitMs, upgradeLevel !== null);
    if (segments.beforeUpgradeMs > 0) await wait(segments.beforeUpgradeMs);
    await playUpgradeCue(upgradeLevel, segments.upgradeMs);
    await waitAfterUpgrade(upgradeLevel);
  }

  async function handleContinue() {
    if (!pendingAdvance) return;
    const nextAdvance = pendingAdvance;
    setPendingAdvance(null);
    await advanceQuestion(
      nextAdvance.nextIndex,
      nextAdvance.nextQueueLength,
      nextAdvance.finalResult,
    );
  }

  useEffect(() => {
    if (!currentQuestion || !setting.enableAudio) return;
    const items = getStudyAudioPlan(questionLevel, currentQuestion).beforeAnswer;
    if (items.length === 0) return;
    const timer = window.setTimeout(() => void speakSequence(items), 180);
    return () => {
      window.clearTimeout(timer);
      stopSpeaking();
    };
  }, [currentIndex, currentQuestion, questionLevel, setting.enableAudio]);

  async function handleAnswer(answer: string) {
    if (!currentWordId || !currentQuestion || isLocked) {
      return;
    }

    const correct = isCorrectAnswer(currentQuestion, answer);
    const correctAnswer = getCorrectAnswer(currentQuestion);
    const feedbackCorrectAnswer = currentQuestion.kind === 'fill-blank'
      ? currentQuestion.studyText
      : correctAnswer;
    const learningAction = currentQuestion.kind === 'recognition'
      ? answer === '认识' ? 'recognized' : 'unknown'
      : 'answer';
    const answeredAt = createDateTimeForDateKey(studyDateKey);
    const answeredAtText = answeredAt.toISOString();
    const isSameDayRetry = currentRepeatCount > 0
      || (
        currentQuestion.kind === 'fill-blank'
        && hasTodayWrongDifficultSpellingAttempt(
          answerEvents,
          currentWordId,
          studyDateKey,
          questionLevel,
        )
      );
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
      isSessionRetry: isSameDayRetry,
    };
    const shouldRevealLifePhoto = correct
      && questionLevel === 2
      && Boolean(localLifePhotosById[currentWordId] || currentQuestion.word.relatedMedia?.lifePhoto);
    const lifePhotoRevealFlow = getLifePhotoRevealFlow(
      questionLevel,
      correct,
      shouldRevealLifePhoto,
    );
    const shouldRevealOxfordResult = correct
      && questionLevel === 4
      && Boolean(currentQuestion.word.relatedMedia?.oxford?.sentence);
    const shouldRevealRedRocketResult = correct
      && questionLevel === 6
      && Boolean(currentQuestion.word.relatedMedia?.redRocket?.sentence);
    const shouldRevealRelatedResult = shouldRevealOxfordResult || shouldRevealRedRocketResult;
    const answerFlow = getLearningAnswerFlow(
      questionLevel,
      correct,
      shouldRevealRelatedResult,
    );
    const shouldRepeat = (
      !isDebugSession
      && !correct
      && !answerFlow.retrySameQuestion
    );
    const nextLevel = correct ? Math.min(10, questionLevel + 1) : questionLevel;
    const shouldAnimateUpgrade = correct && nextLevel > questionLevel;
    const nextQueueLength = queue.length + (shouldRepeat ? 1 : 0);
    const nextIndex = currentIndex + 1;
    const nextSessionResult = {
      totalAnswered: sessionResult.totalAnswered + 1,
      correctCount: sessionResult.correctCount + (correct ? 1 : 0),
      wrongCount: sessionResult.wrongCount + (correct ? 0 : 1),
    };

    setIsLocked(true);
    setSelectedAnswer(answer);
    setRevealLifePhoto(false);
    setUpgradeToLevel(null);
    setFeedbackText(getAnswerFeedbackText(
      currentQuestion,
      questionLevel,
      correct,
      feedbackCorrectAnswer,
    ));
    setSessionResult(nextSessionResult);

    if (shouldRepeat) {
      setRepeatCounts((previous) => ({
        ...previous,
        [currentWordId]: currentRepeatCount + 1,
      }));
      setQueue((previous) => [...previous, currentWordId]);
    }

    await onAnswer(answerEvent);
    const speechItems = setting.enableAudio
      ? getStudyAudioPlan(questionLevel, currentQuestion, correct).afterAnswer
      : [];
    if (shouldRevealRelatedResult) {
      const relatedAudio = splitRelatedResultAudio(
        questionLevel,
        currentQuestion,
        speechItems,
      );
      if (relatedAudio.beforeReveal.length > 0) {
        await speakSequence(relatedAudio.beforeReveal);
      }
      await wait(1_000);
      setRelatedResultPhase('fading-out');
      await wait(220);
      setRelatedResultPhase('revealed');
      if (relatedAudio.afterReveal.length > 0) {
        await speakSequence(relatedAudio.afterReveal);
      }
      await playUpgradeCue(
        shouldAnimateUpgrade ? nextLevel : null,
        LEVEL_UP_ANIMATION_MS,
      );
      if (answerFlow.requiresManualContinue) {
        setPendingAdvance({
          nextIndex,
          nextQueueLength,
          finalResult: nextSessionResult,
        });
        return;
      }
      await waitWithFinalUpgrade(
        answerFlow.holdAfterFeedbackMs,
        shouldAnimateUpgrade ? nextLevel : null,
      );
    } else if (lifePhotoRevealFlow) {
      if (speechItems.length > 0) await speakSequence(speechItems);
      await wait(lifePhotoRevealFlow.revealAfterAudioMs);
      setRevealLifePhoto(true);
      await waitWithFinalUpgrade(
        lifePhotoRevealFlow.holdAfterRevealMs,
        shouldAnimateUpgrade ? nextLevel : null,
      );
    } else {
      if (speechItems.length > 0) await speakSequence(speechItems);
      await waitWithFinalUpgrade(
        answerFlow.holdAfterFeedbackMs,
        shouldAnimateUpgrade ? nextLevel : null,
      );
    }

    if (answerFlow.retrySameQuestion || (isDebugProgression && !correct)) {
      resetAnswerUi();
      setQuestionStartedAt(Date.now());
      setIsLocked(false);
      return;
    }

    await advanceQuestion(nextIndex, nextQueueLength, nextSessionResult);
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

  const shouldShowDifficultSpellingSkip = (
    !isLocked
    && currentQuestion.kind === 'fill-blank'
    && currentWord.difficulty >= 4
    && questionLevel >= 8
    && questionLevel <= 9
    && (
      currentRepeatCount > 0
      || hasTodayWrongDifficultSpellingAttempt(
        answerEvents,
        currentWord.id,
        studyDateKey,
        questionLevel,
      )
    )
  );
  const feedbackStripText = pendingAdvance
    ? '查看完关联页面后，点击“继续”'
    : feedbackText;

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
                {!isDebugProgression ? (
                  <button
                    className="learning-direct-correct learning-direct-correct--all"
                    type="button"
                    disabled={isLocked}
                    onClick={() => void handleAllCorrect()}
                  >
                    全部答对
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {currentQuestion.kind === 'image-choice' || currentQuestion.kind === 'image-english-choice' ? (
          <QuestionImage
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
            selectedAnswer={selectedAnswer}
            localLifePhoto={localLifePhotosById[currentWord.id]}
            revealLifePhoto={revealLifePhoto}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'recognition' ? (
          <QuestionRecognition
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
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
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
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
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
            selectedAnswer={selectedAnswer}
            relatedResultPhase={relatedResultPhase}
            onContinue={() => void handleContinue()}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'sentence-choice' ? (
          <QuestionSentenceChoice
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
            selectedAnswer={selectedAnswer}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'letter-choice' ? (
          <QuestionLetterChoice
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
            selectedAnswer={selectedAnswer}
            relatedResultPhase={relatedResultPhase}
            onContinue={() => void handleContinue()}
            onSubmit={handleAnswer}
          />
        ) : null}

        {currentQuestion.kind === 'fill-blank' ? (
          <QuestionFillBlank
            question={currentQuestion}
            disabled={isLocked}
            enableAudio={setting.enableAudio}
            questionLevel={questionLevel}
            upgradeToLevel={upgradeToLevel}
            selectedAnswer={selectedAnswer}
            localLifePhoto={localLifePhotosById[currentWord.id]}
            showHints={setting.showHints}
            showDifficultSpellingSkip={
              shouldShowDifficultSpellingSkip
            }
            onSubmit={handleAnswer}
          />
        ) : null}

        {feedbackStripText ? (
          <footer className="feedback-strip is-visible">
            {feedbackStripText}
          </footer>
        ) : null}
      </section>
    </main>
  );
}
