import { useEffect, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  normalizeWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { getStudyText } from '../services/word-service';

type ReviewPreviewWord = WordPayload['words'][number];

const reviewPreviewHotspotClasses = [
  'review-hotspot--preview-1',
  'review-hotspot--preview-2',
  'review-hotspot--preview-3',
  'review-hotspot--preview-4',
] as const;

const REVIEW_FRAME_WIDTH = 1158;
const REVIEW_FRAME_HEIGHT = 808;
const REVIEW_VIEWPORT_GAP = 24;

interface ReviewPageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  setting: ParentSetting;
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  masteredCount: number;
  recentTasks: DailyTaskSummary[];
  previewWords: WordPayload['words'];
  onStart: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onSaveSelectionStates: (states: WordSelectionState[]) => Promise<void>;
}

export function ReviewPage({
  setting,
  recordsById,
  selectionById,
  previewWords,
  onStart,
  onOpenSelection,
  onOpenStats,
  onOpenSettings,
  onSaveSelectionStates,
}: ReviewPageProps) {
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [reviewScale, setReviewScale] = useState(1);
  const selectedWord = selectedWordId ? previewWords.find((word) => word.id === selectedWordId) ?? null : null;
  const selectedWordRecord = selectedWord ? recordsById[selectedWord.id] : undefined;
  const selectedWordSelectionState = selectedWord ? selectionById[selectedWord.id] : undefined;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function syncReviewScale() {
      const shellMode = document.documentElement.dataset.shellMode;

      if (shellMode === 'ipad-fixed') {
        setReviewScale(1);
        return;
      }

      const availableWidth = Math.max(window.innerWidth - REVIEW_VIEWPORT_GAP, 320);
      const availableHeight = Math.max(window.innerHeight - REVIEW_VIEWPORT_GAP, 320);
      const nextScale = Math.min(1, availableWidth / REVIEW_FRAME_WIDTH, availableHeight / REVIEW_FRAME_HEIGHT);

      setReviewScale(nextScale > 0 && Number.isFinite(nextScale) ? nextScale : 1);
    }

    syncReviewScale();
    window.addEventListener('resize', syncReviewScale);
    window.addEventListener('orientationchange', syncReviewScale);

    return () => {
      window.removeEventListener('resize', syncReviewScale);
      window.removeEventListener('orientationchange', syncReviewScale);
    };
  }, [setting.preferLandscape]);

  const scaledFrameWidth = Math.round(REVIEW_FRAME_WIDTH * reviewScale);
  const scaledFrameHeight = Math.round(REVIEW_FRAME_HEIGHT * reviewScale);

  function handleReviewTabClick() {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function savePatchedSelectionStates(states: Array<Partial<WordSelectionState> & Pick<WordSelectionState, 'wordId'>>) {
    const nextStates = states.map((state) => {
      const currentState = selectionById[state.wordId] ?? createDefaultWordSelectionState(state.wordId);
      return normalizeWordSelectionState({
        ...currentState,
        ...state,
        updatedAt: new Date().toISOString(),
      });
    });

    await onSaveSelectionStates(nextStates);
  }

  return (
    <main className="page page--review">
      <div
        className="review-mockup-frame"
        style={{
          width: `${scaledFrameWidth}px`,
          minWidth: `${scaledFrameWidth}px`,
          height: `${scaledFrameHeight}px`,
          minHeight: `${scaledFrameHeight}px`,
        }}
      >
        <div
          className="review-visual-surface"
          role="img"
          aria-label="VocaRabbit 复习页面视觉稿"
          style={{
            width: `${REVIEW_FRAME_WIDTH}px`,
            height: `${REVIEW_FRAME_HEIGHT}px`,
            transform: `scale(${reviewScale})`,
            transformOrigin: 'top left',
          }}
        >
          <button
            className="review-hotspot review-hotspot--profile"
            type="button"
            onClick={onOpenSettings}
            aria-label="打开设置页"
          >
            <span className="review-hotspot__sr">打开设置页</span>
          </button>
          <button
            className="review-hotspot review-hotspot--focus-card"
            type="button"
            onClick={onStart}
            aria-label="开始今日学习"
          >
            <span className="review-hotspot__sr">开始今日学习</span>
          </button>
          <button
            className="review-hotspot review-hotspot--start"
            type="button"
            onClick={onStart}
            aria-label="开始今日学习"
          >
            <span className="review-hotspot__sr">开始今日学习</span>
          </button>
          {previewWords.slice(0, 4).map((word, index) => (
            <button
              key={word.id}
              className={`review-hotspot ${reviewPreviewHotspotClasses[index]}`}
              type="button"
              onClick={() => setSelectedWordId(word.id)}
              aria-label={`打开预览词：${getStudyText(word)}`}
            >
              <span className="review-hotspot__sr">{`打开预览词：${getStudyText(word)}`}</span>
            </button>
          ))}
          <button
            className="review-hotspot review-hotspot--dock-review"
            type="button"
            onClick={handleReviewTabClick}
            aria-label="当前所在页面：复习"
          >
            <span className="review-hotspot__sr">当前所在页面：复习</span>
          </button>
          <button
            className="review-hotspot review-hotspot--dock-selection"
            type="button"
            onClick={onOpenSelection}
            aria-label="打开选词页"
          >
            <span className="review-hotspot__sr">打开选词页</span>
          </button>
          <button
            className="review-hotspot review-hotspot--dock-stats"
            type="button"
            onClick={onOpenStats}
            aria-label="打开统计页"
          >
            <span className="review-hotspot__sr">打开统计页</span>
          </button>
          <button
            className="review-hotspot review-hotspot--dock-settings"
            type="button"
            onClick={onOpenSettings}
            aria-label="打开设置页"
          >
            <span className="review-hotspot__sr">打开设置页</span>
          </button>
        </div>
      </div>

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        setting={setting}
        context="review"
        onClose={() => setSelectedWordId(null)}
        onToggleEnabled={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([
                  {
                    wordId: selectedWord.id,
                    isEnabled: !(selectedWordSelectionState?.isEnabled ?? true),
                    isPaused: false,
                  },
                ])
            : undefined
        }
        onTogglePaused={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([
                  {
                    wordId: selectedWord.id,
                    isEnabled: true,
                    isPaused: !(selectedWordSelectionState?.isPaused ?? false),
                  },
                ])
            : undefined
        }
      />
    </main>
  );
}