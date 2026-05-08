import { useMemo, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import {
  MAX_NEW_WORD_COUNT,
  MAX_REVIEW_LIMIT,
  MIN_NEW_WORD_COUNT,
  MIN_REVIEW_LIMIT,
  type ParentSetting,
} from '../models/parent-setting';

type SettingsDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

interface SettingsPageProps {
  settings: ParentSetting;
  task: DailyTaskSummary;
  onBackHome: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onUpdateSettings: (nextSetting: ParentSetting) => Promise<void>;
  onResetTodayTask: () => Promise<void>;
  onResetLearningProgress: () => Promise<void>;
}

interface SettingsNumberControlProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (nextValue: number) => void;
}

interface SettingsToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

interface SettingsDockButtonProps {
  active?: boolean;
  glyph: SettingsDockGlyph;
  label: string;
  onClick: () => void;
}

function SettingsNumberControl({
  label,
  description,
  value,
  min,
  max,
  suffix,
  onChange,
}: SettingsNumberControlProps) {
  return (
    <article className="settings-number-control">
      <div>
        <span>{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
        <p>{description}</p>
      </div>
      <div className="settings-stepper" aria-label={`${label}调节`}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          -
        </button>
        <span>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </button>
      </div>
    </article>
  );
}

function SettingsToggleRow({ label, description, enabled, onToggle }: SettingsToggleRowProps) {
  return (
    <article className="settings-toggle-row">
      <div>
        <span>{label}</span>
        <p>{description}</p>
      </div>
      <button
        className={`settings-toggle-button${enabled ? ' is-on' : ''}`}
        type="button"
        aria-pressed={enabled}
        onClick={onToggle}
      >
        {enabled ? '已开启' : '已关闭'}
      </button>
    </article>
  );
}

function SettingsDockButton({ active = false, glyph, label, onClick }: SettingsDockButtonProps) {
  return (
    <button
      className={`home-dock__button review-dock__button${active ? ' is-active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <span className={`review-dock__glyph review-dock__glyph--${glyph}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function SettingsPage({
  settings,
  task,
  onBackHome,
  onOpenSelection,
  onOpenStats,
  onUpdateSettings,
  onResetTodayTask,
  onResetLearningProgress,
}: SettingsPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const runtimeInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        isStandalone: false,
        isSafari: false,
      };
    }

    return {
      isStandalone:
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      isSafari: /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent),
    };
  }, []);

  const taskEffectText = !task.completedAt && task.totalAnswered === 0
    ? '今天任务还没开始，修改学习量会立即重算今天的任务。'
    : '今天任务已经开始或完成，修改学习量会用于后续任务；如需立即应用，可以重置今日任务。';
  const saveText = isSaving ? '正在保存设置…' : lastSavedAt ? `已自动保存于 ${lastSavedAt}` : '修改后会立即保存到本机';

  async function applySetting(patch: Partial<ParentSetting>) {
    const nextSetting = {
      ...settings,
      ...patch,
    };

    setIsSaving(true);
    await onUpdateSettings(nextSetting);
    setIsSaving(false);
    setLastSavedAt(
      new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }

  async function handleResetTodayClick() {
    const confirmed = window.confirm('这会按当前设置重新生成今天的任务。今天已有的完成状态会被覆盖，继续吗？');
    if (!confirmed) {
      return;
    }

    await onResetTodayTask();
  }

  async function handleResetProgressClick() {
    const confirmed = window.confirm('这会清空全部学习记录和历史任务，但会保留当前设置。继续吗？');
    if (!confirmed) {
      return;
    }

    await onResetLearningProgress();
  }

  return (
    <main className="page page--home page--settings">
      <div className="settings-mockup-frame">
        <div className="settings-shell__chrome">
          <div className="settings-shell__brand">
            <span className="settings-shell__brand-mark" aria-hidden="true" />
            <span>VocaRabbit</span>
          </div>
          <div className="settings-shell__profile">小树的家长版</div>
        </div>

        <section className="hero-card settings-hero">
          <div className="settings-hero__art" aria-hidden="true" />
          <div className="settings-hero__content">
            <span className="hero-card__eyebrow">设置页 · 家长控制台</span>
            <h1>把学习节奏和本地数据收在这里</h1>
            <p>{saveText}</p>
            <div className="review-pill-row" aria-label="设置页摘要">
              <span className="review-pill">{settings.dailyNewWordCount} 新词 / 天</span>
              <span className="review-pill">{settings.dailyReviewLimit} 复习 / 天</span>
              <span className="review-pill">发音 {settings.enableAudio ? '开' : '关'}</span>
            </div>
          </div>
          <div className="settings-hero__aside">
            <span className="settings-hero__label">当前任务影响</span>
            <strong>{task.completedAt ? '今日已完成' : task.totalAnswered > 0 ? '今日进行中' : '今日未开始'}</strong>
            <p>{taskEffectText}</p>
            <div className="settings-hero__focus-art" aria-hidden="true" />
          </div>
        </section>

        <section className="settings-panel-grid">
        <section className="section-block settings-panel settings-panel--volume">
          <div className="section-block__header">
            <h2>学习量设置</h2>
            <p>先把每天学多少控制稳，再谈更细的页面能力。</p>
          </div>
          <div className="settings-control-grid">
            <SettingsNumberControl
              label="每日新词"
              description="未开始今天任务时会立即重算今天的学习篮子。"
              value={settings.dailyNewWordCount}
              min={MIN_NEW_WORD_COUNT}
              max={MAX_NEW_WORD_COUNT}
              suffix=" / 天"
              onChange={(nextValue) => void applySetting({ dailyNewWordCount: nextValue })}
            />
            <SettingsNumberControl
              label="每日复习上限"
              description="复习压力判断和后续任务生成会用这个上限。"
              value={settings.dailyReviewLimit}
              min={MIN_REVIEW_LIMIT}
              max={MAX_REVIEW_LIMIT}
              suffix=" / 天"
              onChange={(nextValue) => void applySetting({ dailyReviewLimit: nextValue })}
            />
          </div>
        </section>

        <section className="section-block settings-panel settings-panel--experience">
          <div className="section-block__header">
            <h2>学习体验设置</h2>
            <p>这一页只放真正影响孩子学习体验的开关。</p>
          </div>
          <div className="settings-toggle-list">
            <SettingsToggleRow
              label="英文发音"
              description="学习页中的发音按钮会跟着开关实时显示或隐藏。"
              enabled={settings.enableAudio}
              onToggle={() => void applySetting({ enableAudio: !settings.enableAudio })}
            />
            <SettingsToggleRow
              label="图片题"
              description="关闭后，初级题型会改走文字选择，不再进入图片题。"
              enabled={settings.showImages}
              onToggle={() => void applySetting({ showImages: !settings.showImages })}
            />
            <SettingsToggleRow
              label="例句占位"
              description="先保留设置入口；等词表补进例句后，这里会直接生效。"
              enabled={settings.showExamples}
              onToggle={() => void applySetting({ showExamples: !settings.showExamples })}
            />
            <SettingsToggleRow
              label="拼写提示占位"
              description="先保留设置入口；等拼写题细化后，这里会接入提示强度。"
              enabled={settings.showHints}
              onToggle={() => void applySetting({ showHints: !settings.showHints })}
            />
          </div>
        </section>

        <section className="section-block settings-panel settings-panel--device">
          <div className="section-block__header">
            <h2>设备与安装</h2>
            <p>先把 iPad 端的使用前提说明清楚，少踩一次缓存和安装坑。</p>
          </div>
          <div className="settings-support-list">
            <article className="settings-support-item">
              <span>运行方式</span>
              <strong>{runtimeInfo.isStandalone ? '已作为主屏应用运行' : '建议加入主屏使用'}</strong>
              <p>{runtimeInfo.isStandalone ? '当前已经是接近 App 的启动方式。' : '加入主屏后，启动更像独立应用，也更适合 iPad 日常学习。'}</p>
            </article>
            <article className="settings-support-item">
              <span>浏览器环境</span>
              <strong>{runtimeInfo.isSafari ? 'Safari 环境' : '非 Safari 环境'}</strong>
              <p>{runtimeInfo.isSafari ? '当前更接近 iPad 目标环境。' : '正式体验建议回到 Safari，PWA 安装和语音能力会更稳定。'}</p>
            </article>
            <article className="settings-support-item">
              <span>横屏偏好</span>
              <strong>{settings.preferLandscape ? '横屏优先' : '方向自动'}</strong>
              <p>当前页面布局按 iPad 横屏优先设计，后续会继续补竖屏细化。</p>
              <button
                className={`settings-toggle-button${settings.preferLandscape ? ' is-on' : ''}`}
                type="button"
                aria-pressed={settings.preferLandscape}
                onClick={() => void applySetting({ preferLandscape: !settings.preferLandscape })}
              >
                {settings.preferLandscape ? '已优先横屏' : '自动方向'}
              </button>
            </article>
          </div>
        </section>

        <section className="section-block settings-panel settings-panel--danger">
          <div className="section-block__header">
            <h2>数据管理</h2>
            <p>先把真正危险的动作做安全，再补导出导入。</p>
          </div>
          <div className="settings-data-actions">
            <button className="secondary-button" type="button" onClick={() => void handleResetTodayClick()}>
              重置今日任务
            </button>
            <button className="secondary-button settings-danger-button" type="button" onClick={() => void handleResetProgressClick()}>
              清空全部学习记录
            </button>
          </div>
          <p className="settings-inline-note">
            导出 / 导入会放在下一步补齐。这一版先把重置路径和设置持久化打稳，避免改完参数却没有真实效果。
          </p>
        </section>
        </section>

        <nav className="home-dock review-dock settings-dock" aria-label="主页面导航">
          <SettingsDockButton glyph="review" label="复习" onClick={onBackHome} />
          <SettingsDockButton glyph="selection" label="选词" onClick={onOpenSelection} />
          <SettingsDockButton glyph="stats" label="统计" onClick={onOpenStats} />
          <SettingsDockButton active glyph="settings" label="设置" onClick={() => {}} />
        </nav>
      </div>
    </main>
  );
}