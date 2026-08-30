import { AlertCircle, ArrowRight, Mic, RotateCcw } from 'lucide-react';
import type { PronunciationPracticeState } from '../services/pronunciation-practice';

interface PronunciationPracticeCardProps {
  word: string;
  phonetic?: string;
  state: PronunciationPracticeState;
  onStart: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

function stateLabel(state: PronunciationPracticeState): string {
  if (state.kind === 'preparing') return '正在连接语音老师…';
  if (state.kind === 'recording') return '正在听，请清楚地读出单词';
  if (state.kind === 'evaluating') return '正在分析发音…';
  return '听标准发音后，自己读一遍';
}

export function PronunciationPracticeCard({
  word,
  phonetic,
  state,
  onStart,
  onRetry,
  onContinue,
  onSkip,
}: PronunciationPracticeCardProps) {
  const busy = state.kind === 'preparing' || state.kind === 'recording' || state.kind === 'evaluating';
  const meter = state.kind === 'recording'
    ? Math.sqrt(Math.min(1, Math.max(0, state.volume / 50)))
    : 0;
  const hasVoiceInput = meter >= 0.04;
  const barFactors = [0.48, 0.72, 0.9, 0.66, 1, 0.74, 0.88, 0.62, 0.44];

  return (
    <section className="pronunciation-practice" role="dialog" aria-modal="true" aria-label="单词跟读">
      <div className="pronunciation-practice__eyebrow">
        <Mic size={22} aria-hidden="true" />
        <span>跟着读一遍</span>
      </div>
      <strong className="pronunciation-practice__word">{word}</strong>
      {phonetic ? <span className="pronunciation-practice__phonetic">{phonetic}</span> : null}

      {state.kind === 'complete' ? (
        <div className="pronunciation-practice__result" aria-live="polite">
          <span>本次发音</span>
          <strong>{state.score}</strong>
          <small>{state.feedback ?? (state.score >= 75 ? '读得很好' : '再听一次，然后重新跟读')}</small>
        </div>
      ) : null}

      {state.kind === 'unavailable' ? (
        <div className="pronunciation-practice__warning" role="status">
          <AlertCircle size={22} aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : (
        <p className="pronunciation-practice__status" aria-live="polite">{stateLabel(state)}</p>
      )}

      {state.kind === 'recording' ? (
        <div
          className={`pronunciation-practice__meter${hasVoiceInput ? ' is-active' : ''}`}
          role="status"
          aria-label={hasVoiceInput ? '已收到声音' : '等待声音'}
        >
          <div className="pronunciation-practice__meter-bars" aria-hidden="true">
            {barFactors.map((factor, index) => (
              <span
                key={index}
                style={{
                  height: `${Math.round(18 + meter * factor * 78)}%`,
                  animationDelay: `${index * -55}ms`,
                }}
              />
            ))}
          </div>
          <small>{hasVoiceInput ? '已收到声音' : '等待声音'}</small>
        </div>
      ) : null}

      <div className="pronunciation-practice__actions">
        {state.kind === 'ready' ? (
          <button className="primary-button" type="button" onClick={onStart}>
            <Mic size={22} aria-hidden="true" />
            开始跟读
          </button>
        ) : null}
        {state.kind === 'complete' ? (
          <>
            <button className="secondary-button" type="button" onClick={onRetry}>
              <RotateCcw size={20} aria-hidden="true" />
              再读一次
            </button>
            <button className="primary-button" type="button" onClick={onContinue}>
              继续
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          </>
        ) : null}
        {state.kind === 'unavailable' ? (
          <>
            <button className="primary-button" type="button" onClick={onRetry}>
              <RotateCcw size={20} aria-hidden="true" />
              重新跟读
            </button>
            <button className="secondary-button" type="button" onClick={onSkip}>
              暂时跳过
            </button>
          </>
        ) : null}
        {busy ? <span className="pronunciation-practice__busy" aria-hidden="true" /> : null}
      </div>
    </section>
  );
}
