import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import {
  MIN_NEW_WORD_COUNT,
  MIN_REVIEW_LIMIT,
  type ParentSetting,
  type ProfileId,
} from '../models/parent-setting';
import { APP_VERSION } from '../config/app-meta';
import { ProfileSelector } from '../components/ProfileSelector';
import type { LifePhotoImportResult } from '../services/local-media-service';
import type { StudyDataImportResult } from '../services/study-data-import';
import type { WordRecord } from '../models/word';
import {
  collectOfflineImageUrls,
  downloadOfflineImages,
  getOfflineImageCacheStatus,
  requestPersistentImageStorage,
} from '../services/offline-image-cache-service';

interface SettingsPageProps {
  settings: ParentSetting;
  task: DailyTaskSummary;
  onBackHome: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onUpdateSettings: (nextSetting: ParentSetting) => Promise<'synced' | 'pending'>;
  onSelectProfile: (profileId: ProfileId) => Promise<void>;
  onExportStudyData: () => Promise<void>;
  onImportStudyData: (file: File) => Promise<StudyDataImportResult>;
  onClearLocalData: (familyCode: string) => Promise<void>;
  onImportLifePhotoPackage: (file: File) => Promise<LifePhotoImportResult>;
  localLifePhotoCount: number;
  localLifePhotoImportedAt: string | null;
  words: WordRecord[];
}

interface SettingsNumberControlProps {
  icon: string;
  label: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  suffix: string;
  hint: string;
  onChange: (nextValue: number) => void;
}

interface SettingsToggleRowProps {
  icon: string;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

/* ─── helpers ─── */

function formatImportedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ─── Sub-components ─── */

function SettingsNumberControl({
  icon,
  label,
  description,
  value,
  min,
  max,
  suffix,
  hint,
  onChange,
}: SettingsNumberControlProps) {
  return (
    <article className="settings-number-control">
      <div className="settings-number-control__header">
        <span className="settings-number-control__icon" aria-hidden="true">{icon}</span>
        <span className="settings-number-control__label">{label}</span>
      </div>
      <div className="settings-number-control__body">
        <div className="settings-stepper" aria-label={`${label}调节`}>
          <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
            −
          </button>
          <strong>{value}<small>{suffix}</small></strong>
          <button
            type="button"
            onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
            disabled={max !== undefined && value >= max}
          >
            +
          </button>
        </div>
        <span className="settings-number-control__hint">{hint}</span>
      </div>
      <p className="settings-number-control__desc">{description}</p>
    </article>
  );
}

function SettingsToggleRow({ icon, label, description, enabled, onToggle }: SettingsToggleRowProps) {
  return (
    <article className="settings-toggle-row">
      <span className="settings-toggle-row__icon" aria-hidden="true">{icon}</span>
      <div className="settings-toggle-row__text">
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`settings-toggle-button${enabled ? ' is-on' : ''}`}
        type="button"
        aria-pressed={enabled}
        onClick={onToggle}
      />
    </article>
  );
}

/* ─── Main Page ─── */

export function SettingsPage({
  settings,
  task,
  onBackHome,
  onOpenSelection,
  onOpenStats,
  onUpdateSettings,
  onSelectProfile,
  onExportStudyData,
  onImportStudyData,
  onClearLocalData,
  onImportLifePhotoPackage,
  localLifePhotoCount,
  localLifePhotoImportedAt,
  words,
}: SettingsPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [loadDraft, setLoadDraft] = useState(() => ({
    dailyNewWordCount: settings.dailyNewWordCount,
    dailyReviewLimit: settings.dailyReviewLimit,
  }));
  const [isImportingPhotos, setIsImportingPhotos] = useState(false);
  const [isImportingStudyData, setIsImportingStudyData] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<'synced' | 'pending' | 'error' | null>(null);
  const [lifePhotoImportSummary, setLifePhotoImportSummary] = useState<string | null>(null);
  const [lifePhotoImportError, setLifePhotoImportError] = useState<string | null>(null);
  const [studyDataImportSummary, setStudyDataImportSummary] = useState<string | null>(null);
  const [studyDataImportError, setStudyDataImportError] = useState<string | null>(null);
  const [offlineImageState, setOfflineImageState] = useState<{
    phase: 'checking' | 'idle' | 'downloading' | 'complete' | 'error' | 'unsupported';
    completed: number;
    total: number;
    failed: number;
  }>({ phase: 'checking', completed: 0, total: 0, failed: 0 });
  const lifePhotoInputRef = useRef<HTMLInputElement>(null);
  const studyDataInputRef = useRef<HTMLInputElement>(null);
  const imageDownloadAbortRef = useRef<AbortController | null>(null);
  const offlineImageUrls = useMemo(() => collectOfflineImageUrls(words), [words]);

  useEffect(() => {
    setLoadDraft({
      dailyNewWordCount: settings.dailyNewWordCount,
      dailyReviewLimit: settings.dailyReviewLimit,
    });
  }, [settings.dailyNewWordCount, settings.dailyReviewLimit]);

  useEffect(() => {
    let cancelled = false;
    if (typeof caches === 'undefined') {
      setOfflineImageState({ phase: 'unsupported', completed: 0, total: offlineImageUrls.length, failed: 0 });
      return () => {
        cancelled = true;
      };
    }

    setOfflineImageState((current) => ({ ...current, phase: 'checking', total: offlineImageUrls.length }));
    void getOfflineImageCacheStatus(offlineImageUrls).then(({ cached, total }) => {
      if (cancelled) return;
      setOfflineImageState({
        phase: cached === total && total > 0 ? 'complete' : 'idle',
        completed: cached,
        total,
        failed: 0,
      });
    }).catch(() => {
      if (!cancelled) {
        setOfflineImageState({ phase: 'error', completed: 0, total: offlineImageUrls.length, failed: 0 });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [offlineImageUrls]);

  const runtimeInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return { isStandalone: false, isSafari: false };
    }
    return {
      isStandalone:
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      isSafari: /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent),
    };
  }, []);

  const saveText = isSaving
    ? '正在保存并同步设置…'
    : lastSaveStatus === 'synced' && lastSavedAt
      ? `已保存并同步到服务器 · ${lastSavedAt}`
      : lastSaveStatus === 'pending' && lastSavedAt
        ? `已保存在本机，等待服务器连接后同步 · ${lastSavedAt}`
        : lastSaveStatus === 'error'
          ? '设置保存失败，请稍后重试。'
          : '调整学习负荷后点击确定，其他设置会即时生效。';
  const hasPendingLoadSetting = loadDraft.dailyNewWordCount !== settings.dailyNewWordCount
    || loadDraft.dailyReviewLimit !== settings.dailyReviewLimit;
  const taskStatus = task.completedAt ? '今日已完成' : task.totalAnswered > 0 ? '今日进行中' : '今日未开始';
  const taskEffectText = !task.completedAt && task.totalAnswered === 0
    ? '今日设置将影响今天的任务分配，建议在开始前完成调整。'
    : '今天任务已经开始，修改将用于后续任务。';

  async function applySetting(patch: Partial<ParentSetting>) {
    const nextSetting = { ...settings, ...patch };
    setIsSaving(true);
    setLastSaveStatus(null);
    try {
      const saveStatus = await onUpdateSettings(nextSetting);
      setLastSaveStatus(saveStatus);
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setLastSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmLoadSetting() {
    if (!hasPendingLoadSetting || isSaving) return;
    await applySetting(loadDraft);
  }

  async function handleClearAllData() {
    const familyCode = window.prompt('请输入首次连接设备时使用的家庭验证码：');
    if (familyCode === null || !familyCode.trim()) return;
    try {
      await onClearLocalData(familyCode.trim());
    } catch (caughtError) {
      window.alert(caughtError instanceof Error ? caughtError.message : '验证码校验失败，请稍后重试。');
    }
  }

  async function handleExportDataClick() {
    await onExportStudyData();
    setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  }

  async function handleOfflineImageDownload() {
    if (offlineImageState.phase === 'downloading') {
      imageDownloadAbortRef.current?.abort();
      return;
    }
    if (typeof caches === 'undefined') {
      setOfflineImageState({ phase: 'unsupported', completed: 0, total: offlineImageUrls.length, failed: 0 });
      return;
    }

    const abortController = new AbortController();
    imageDownloadAbortRef.current = abortController;
    setOfflineImageState((current) => ({ ...current, phase: 'downloading', failed: 0 }));
    void requestPersistentImageStorage();

    try {
      const result = await downloadOfflineImages(offlineImageUrls, {
        signal: abortController.signal,
        onProgress: ({ completed, total, failed }) => {
          setOfflineImageState({ phase: 'downloading', completed, total, failed });
        },
      });
      setOfflineImageState({
        phase: result.failed > 0 ? 'error' : 'complete',
        completed: result.cached + result.downloaded,
        total: result.total,
        failed: result.failed,
      });
    } catch (caughtError) {
      const status = await getOfflineImageCacheStatus(offlineImageUrls).catch(() => ({
        cached: offlineImageState.completed,
        total: offlineImageUrls.length,
      }));
      setOfflineImageState({
        phase: abortController.signal.aborted ? 'idle' : 'error',
        completed: status.cached,
        total: status.total,
        failed: abortController.signal.aborted ? 0 : 1,
      });
    } finally {
      if (imageDownloadAbortRef.current === abortController) {
        imageDownloadAbortRef.current = null;
      }
    }
  }

  async function handleLifePhotoPackageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    if (
      localLifePhotoCount > 0
      && !window.confirm(`当前设备已有 ${localLifePhotoCount} 张生活照片。新照片包会完整替换旧照片包，继续吗？`)
    ) {
      event.currentTarget.value = '';
      return;
    }

    setIsImportingPhotos(true);
    setLifePhotoImportError(null);
    try {
      const result = await onImportLifePhotoPackage(file);
      const importedTime = formatImportedAt(result.importedAt);
      setLifePhotoImportSummary(
        `已导入 ${result.imported} 张，跳过 ${result.skipped} 张${importedTime ? ` · 导入时间 ${importedTime}` : ''}`,
      );
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch (caughtError) {
      setLifePhotoImportSummary(null);
      setLifePhotoImportError(
        `导入失败：${caughtError instanceof Error ? caughtError.message : '无法读取生活照片包。'}`,
      );
    } finally {
      setIsImportingPhotos(false);
      event.currentTarget.value = '';
    }
  }

  async function handleStudyDataChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    if (!window.confirm('导入备份会替换当前学习进度、设置、选词状态和答题记录，但会保留本地生活照片。继续吗？')) {
      event.currentTarget.value = '';
      return;
    }

    setIsImportingStudyData(true);
    setStudyDataImportError(null);
    try {
      const result = await onImportStudyData(file);
      setStudyDataImportSummary(
        `已恢复 ${result.learningRecords} 条学习记录、${result.answerEvents} 条答题记录`,
      );
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch (caughtError) {
      setStudyDataImportSummary(null);
      setStudyDataImportError(
        `恢复失败：${caughtError instanceof Error ? caughtError.message : '无法读取学习数据备份。'}`,
      );
    } finally {
      setIsImportingStudyData(false);
      event.currentTarget.value = '';
    }
  }

  const savedLifePhotoTime = formatImportedAt(localLifePhotoImportedAt);
  const lifePhotoStatus = lifePhotoImportSummary
    ?? (localLifePhotoCount > 0
      ? `已导入 ${localLifePhotoCount} 张${savedLifePhotoTime ? ` · 导入时间 ${savedLifePhotoTime}` : ''}，只保存在这台设备。`
      : '尚未导入生活照片，只会保存在当前设备。');
  const offlineImagePercent = offlineImageState.total > 0
    ? Math.round((offlineImageState.completed / offlineImageState.total) * 100)
    : 0;
  const offlineImageStatusText = offlineImageState.phase === 'checking'
    ? '正在检查本机图片…'
    : offlineImageState.phase === 'unsupported'
      ? '当前浏览器不支持离线图片缓存。'
      : offlineImageState.phase === 'downloading'
        ? `正在下载 ${offlineImageState.completed}/${offlineImageState.total}（${offlineImagePercent}%）`
        : offlineImageState.phase === 'complete'
          ? `已下载全部 ${offlineImageState.total} 个图片资源，可离线快速显示。`
          : offlineImageState.phase === 'error'
            ? `已保存 ${offlineImageState.completed}/${offlineImageState.total}，${offlineImageState.failed} 个下载失败，可继续下载。`
            : offlineImageState.completed > 0
              ? `已保存 ${offlineImageState.completed}/${offlineImageState.total}，点击继续下载。`
              : `共 ${offlineImageState.total} 个图片资源，生活照片无需重复下载。`;
  const offlineImageButtonText = offlineImageState.phase === 'downloading'
    ? '停止下载'
    : offlineImageState.phase === 'complete'
      ? '检查更新'
      : offlineImageState.completed > 0
        ? '继续下载'
        : '下载图片';

  return (
    <main className="page page--home page--settings" data-profile={settings.profileId}>
      <div className="settings-mockup-frame">
        <div className="settings-shell__chrome">
          <div className="settings-shell__brand app-brand-lockup">
            <span className="app-brand-lockup__mark" aria-hidden="true" />
            <span className="app-brand-lockup__wordmark">VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <ProfileSelector
            value={settings.profileId}
            buttonClassName="settings-shell__profile app-profile-chip"
            onChange={onSelectProfile}
          />
        </div>

        {/* ─── Hero ─── */}
        <section className="hero-card settings-hero">
          <div className="settings-hero__art" aria-hidden="true" />
          <div className="settings-hero__content">
            <span className="hero-card__eyebrow">设置页 · 家长控制台</span>
            <h1>把学习节奏和<br />本地数据收在这里</h1>
            <p>{saveText}</p>
            <div className="review-pill-row" aria-label="设置页摘要">
              <span className="review-pill"><em>🌿</em> 每日新词 <strong>{settings.dailyNewWordCount}</strong> 个</span>
              <span className="review-pill"><em>🕐</em> 每日复习上限 <strong>{settings.dailyReviewLimit}</strong> 个</span>
              <span className="review-pill"><em>🔊</em> 音频 <strong>{settings.enableAudio ? '已开启' : '已关闭'}</strong></span>
            </div>
          </div>
          <div className="settings-hero__aside">
            <span className="settings-hero__label">📋 当前任务影响</span>
            <strong>{taskStatus}</strong>
            <p>{taskEffectText}</p>
            <div className="review-pill-row">
              <span className="review-pill">🕐 下次同步 {lastSavedAt ?? '18:30'}</span>
              <span className="review-pill">✓ 任务将在明日生效</span>
            </div>
            <div className="settings-hero__focus-art" aria-hidden="true" />
          </div>
        </section>

        {/* ─── Four-column settings console ─── */}
        <section className="settings-panel-grid">
          {/* Top-left: 学习负荷设置 */}
          <section className="section-block settings-panel settings-panel--volume">
            <div className="section-block__header">
              <h2><span className="settings-panel__icon settings-panel__icon--info">ℹ</span> 学习负荷设置</h2>
              <p>根据孩子的学习能力与时间，合理设置学习负荷。</p>
            </div>
            <div className="settings-control-grid">
              <SettingsNumberControl
                icon="🌿"
                label="每日新词"
                description=""
                value={loadDraft.dailyNewWordCount}
                min={MIN_NEW_WORD_COUNT}
                suffix=" 个"
                hint={`最少 ${MIN_NEW_WORD_COUNT} 个`}
                onChange={(dailyNewWordCount) => setLoadDraft((current) => ({ ...current, dailyNewWordCount }))}
              />
              <SettingsNumberControl
                icon="🕐"
                label="每日复习上限"
                description=""
                value={loadDraft.dailyReviewLimit}
                min={MIN_REVIEW_LIMIT}
                suffix=" 个"
                hint={`最少 ${MIN_REVIEW_LIMIT} 个`}
                onChange={(dailyReviewLimit) => setLoadDraft((current) => ({ ...current, dailyReviewLimit }))}
              />
            </div>
            <button
              className="primary-button settings-volume-confirm"
              type="button"
              disabled={!hasPendingLoadSetting || isSaving}
              onClick={() => void confirmLoadSetting()}
            >
              {isSaving ? '保存中…' : '确定'}
            </button>
          </section>

          {/* Top-right: 设备与使用方式 */}
          <section className="section-block settings-panel settings-panel--device">
            <div className="section-block__header">
              <h2><span className="settings-panel__icon settings-panel__icon--device">📱</span> 设备与使用方式</h2>
              <p>推荐的设备与浏览器设置，获得更稳定的学习体验。</p>
            </div>
            <div className="settings-device-list">
              <article className="settings-device-item">
                <span className="settings-device-item__icon">📱</span>
                <div>
                  <strong>iPad 独立模式</strong>
                  <p>建议在 iPad 上使用完整功能。</p>
                </div>
                <span className="settings-badge settings-badge--recommend">推荐</span>
              </article>
              <article className="settings-device-item">
                <span className="settings-device-item__icon">🧭</span>
                <div>
                  <strong>Safari 环境</strong>
                  <p>使用 Safari 浏览器访问，体验更佳。</p>
                </div>
                <span className={`settings-badge ${runtimeInfo.isSafari ? 'settings-badge--active' : 'settings-badge--recommend'}`}>
                  {runtimeInfo.isSafari ? '已启用' : '推荐'}
                </span>
              </article>
              <article className="settings-device-item">
                <span className="settings-device-item__icon">🔄</span>
                <div>
                  <strong>横屏使用</strong>
                  <p>推荐横屏使用，内容与操作更舒适。</p>
                </div>
                <span className={`settings-badge ${settings.preferLandscape ? 'settings-badge--active' : 'settings-badge--recommend'}`}>
                  {settings.preferLandscape ? '已启用' : '推荐'}
                </span>
              </article>
            </div>
          </section>

          {/* Bottom-left: 学习体验设置 */}
          <section className="section-block settings-panel settings-panel--experience">
            <div className="section-block__header">
              <h2><span className="settings-panel__icon settings-panel__icon--heart">❤️</span> 学习体验设置</h2>
              <p>个性化学习体验，让学习更顺畅、更有效。</p>
            </div>
            <div className="settings-toggle-list">
              <SettingsToggleRow
                icon="🔊"
                label="英文音频"
                description="播放英文发音，帮助孩子磨耳朵。"
                enabled={settings.enableAudio}
                onToggle={() => void applySetting({ enableAudio: !settings.enableAudio })}
              />
              <SettingsToggleRow
                icon="🖼"
                label="图片题"
                description="以图片形式呈现题目，更直观易懂。"
                enabled={settings.showImages}
                onToggle={() => void applySetting({ showImages: !settings.showImages })}
              />
              <SettingsToggleRow
                icon="❝"
                label="例句展示"
                description="展示实用例句，理解单词在真实语境中的用法。"
                enabled={settings.showExamples}
                onToggle={() => void applySetting({ showExamples: !settings.showExamples })}
              />
              <SettingsToggleRow
                icon="✏️"
                label="拼写提示"
                description="拼写时提供字母提示，降低拼写难度。"
                enabled={settings.showHints}
                onToggle={() => void applySetting({ showHints: !settings.showHints })}
              />
            </div>
          </section>

          {/* Bottom-right: 本地数据管理 */}
          <section className="section-block settings-panel settings-panel--danger">
            <div className="section-block__header">
              <h2><span className="settings-panel__icon settings-panel__icon--data">⚙️</span> 本地数据管理</h2>
              <p>管理本地学习数据，确保安全与可控。</p>
            </div>
            <div className="settings-data-list">
              <article className="settings-data-item">
                <span className="settings-data-item__icon">⬆️</span>
                <div>
                  <strong>导出数据</strong>
                  <p>导出学习数据备份，便于保存或迁移。</p>
                </div>
                <button className="secondary-button" type="button" onClick={() => void handleExportDataClick()}>
                  导出数据
                </button>
              </article>
              <article className="settings-data-item">
                <span className="settings-data-item__icon">⬇️</span>
                <div>
                  <strong>导入学习数据</strong>
                  <p>{studyDataImportSummary ?? '从 VocaRabbit JSON 备份恢复学习进度和设置。'}</p>
                  {studyDataImportError && <p className="settings-data-error" role="alert">{studyDataImportError}</p>}
                </div>
                <input
                  ref={studyDataInputRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(event) => void handleStudyDataChange(event)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isImportingStudyData}
                  onClick={() => studyDataInputRef.current?.click()}
                >
                  {isImportingStudyData ? '恢复中…' : '选择备份'}
                </button>
              </article>
              <article className="settings-data-item">
                <span className="settings-data-item__icon">🖼</span>
                <div>
                  <strong>导入生活照片包</strong>
                  <p>{lifePhotoStatus}</p>
                  {lifePhotoImportError && <p className="settings-data-error" role="alert">{lifePhotoImportError}</p>}
                </div>
                <input
                  ref={lifePhotoInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(event) => void handleLifePhotoPackageChange(event)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isImportingPhotos}
                  onClick={() => lifePhotoInputRef.current?.click()}
                >
                  {isImportingPhotos ? '导入中…' : '选择照片包'}
                </button>
              </article>
              <article className="settings-data-item settings-data-item--images">
                <span className="settings-data-item__icon">☁️</span>
                <div aria-live="polite">
                  <strong>下载全部图片到本地</strong>
                  <p>{offlineImageStatusText}</p>
                  {(offlineImageState.phase === 'downloading' || offlineImageState.completed > 0) && (
                    <span className="settings-image-download-progress" aria-hidden="true">
                      <span style={{ width: `${offlineImagePercent}%` }} />
                    </span>
                  )}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={offlineImageState.phase === 'checking' || offlineImageState.phase === 'unsupported'}
                  onClick={() => void handleOfflineImageDownload()}
                >
                  {offlineImageButtonText}
                </button>
              </article>
              <article className="settings-data-item settings-data-item--danger">
                <span className="settings-data-item__icon">🗑</span>
                <div>
                  <strong>清空本地学习数据</strong>
                  <p>验证家庭验证码后，只清空当前设备；云端数据不会删除。</p>
                </div>
                <button className="secondary-button settings-danger-button" type="button" onClick={() => void handleClearAllData()}>
                  清空本机
                </button>
              </article>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
