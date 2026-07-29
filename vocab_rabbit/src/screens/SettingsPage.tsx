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
import type {
  PrivateLifePhotoDownloadOptions,
  PrivateLifePhotoDownloadResult,
} from '../services/private-life-photo-service';
import type { StudyDataImportResult } from '../services/study-data-import';
import type { WordRecord } from '../models/word';
import {
  collectOfflineImageUrls,
  downloadOfflineImages,
  getOfflineImageCacheStatus,
  requestPersistentImageStorage,
} from '../services/offline-image-cache-service';
import {
  getAvailableSpeechVoices,
  speakSequence,
  subscribeSpeechVoices,
  type SpeechVoiceOption,
} from '../services/audio-service';

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
  onDownloadPrivateLifePhotos: (
    options: PrivateLifePhotoDownloadOptions,
  ) => Promise<PrivateLifePhotoDownloadResult>;
  localLifePhotoCount: number;
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

interface SettingsVoiceSelectProps {
  icon: string;
  label: string;
  language: 'en' | 'zh';
  value: string;
  voices: SpeechVoiceOption[];
  disabled: boolean;
  onChange: (voiceURI: string) => void;
  onPreview: () => void;
}

type EditableSettings = Pick<
  ParentSetting,
  | 'dailyNewWordCount'
  | 'dailyReviewLimit'
  | 'enableAudio'
  | 'showImages'
  | 'showExamples'
  | 'showHints'
  | 'englishVoiceURI'
  | 'chineseVoiceURI'
>;

/* ─── helpers ─── */

function createSettingsDraft(settings: ParentSetting): EditableSettings {
  return {
    dailyNewWordCount: settings.dailyNewWordCount,
    dailyReviewLimit: settings.dailyReviewLimit,
    enableAudio: settings.enableAudio,
    showImages: settings.showImages,
    showExamples: settings.showExamples,
    showHints: settings.showHints,
    englishVoiceURI: settings.englishVoiceURI,
    chineseVoiceURI: settings.chineseVoiceURI,
  };
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

function SettingsVoiceSelect({
  icon,
  label,
  language,
  value,
  voices,
  disabled,
  onChange,
  onPreview,
}: SettingsVoiceSelectProps) {
  const savedVoiceUnavailable = Boolean(value) && !voices.some((voice) => voice.voiceURI === value);
  return (
    <article className="settings-voice-item">
      <div className="settings-voice-item__header">
        <span className="settings-voice-item__icon" aria-hidden="true">{icon}</span>
        <strong>{label}</strong>
        <button type="button" onClick={onPreview}>试听</button>
      </div>
      <select
        aria-label={`${label}音色`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">系统默认</option>
        {savedVoiceUnavailable ? <option value={value}>已保存音色（当前设备不可用）</option> : null}
        {voices.map((voice) => (
          <option key={voice.voiceURI} value={voice.voiceURI}>
            {voice.name} · {voice.lang}{voice.localService ? ' · 本机' : ''}
          </option>
        ))}
      </select>
      <p>{voices.length > 0 ? `当前设备提供 ${voices.length} 种${language === 'en' ? '英文' : '中文'}音色` : '等待设备返回可用音色'}</p>
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
  onDownloadPrivateLifePhotos,
  localLifePhotoCount,
  words,
}: SettingsPageProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(() => createSettingsDraft(settings));
  const [isImportingStudyData, setIsImportingStudyData] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveStatus, setLastSaveStatus] = useState<'synced' | 'pending' | 'error' | null>(null);
  const [studyDataImportSummary, setStudyDataImportSummary] = useState<string | null>(null);
  const [studyDataImportError, setStudyDataImportError] = useState<string | null>(null);
  const [englishVoices, setEnglishVoices] = useState<SpeechVoiceOption[]>([]);
  const [chineseVoices, setChineseVoices] = useState<SpeechVoiceOption[]>([]);
  const [offlineImageState, setOfflineImageState] = useState<{
    phase: 'checking' | 'idle' | 'downloading' | 'complete' | 'error' | 'unsupported';
    completed: number;
    total: number;
    failed: number;
  }>({ phase: 'checking', completed: 0, total: 0, failed: 0 });
  const [privatePhotoState, setPrivatePhotoState] = useState<{
    phase: 'idle' | 'downloading' | 'complete' | 'error';
    completed: number;
    total: number;
    failed: number;
    message: string | null;
  }>({
    phase: 'idle',
    completed: localLifePhotoCount,
    total: words.filter((word) => Boolean(word.relatedMedia?.lifePhoto)).length,
    failed: 0,
    message: null,
  });
  const studyDataInputRef = useRef<HTMLInputElement>(null);
  const imageDownloadAbortRef = useRef<AbortController | null>(null);
  const privatePhotoAbortRef = useRef<AbortController | null>(null);
  const offlineImageUrls = useMemo(() => collectOfflineImageUrls(words), [words]);

  useEffect(() => {
    setSettingsDraft(createSettingsDraft(settings));
  }, [
    settings.dailyNewWordCount,
    settings.dailyReviewLimit,
    settings.enableAudio,
    settings.showImages,
    settings.showExamples,
    settings.showHints,
    settings.englishVoiceURI,
    settings.chineseVoiceURI,
  ]);

  useEffect(() => {
    return subscribeSpeechVoices(() => {
      setEnglishVoices(getAvailableSpeechVoices('en'));
      setChineseVoices(getAvailableSpeechVoices('zh'));
    });
  }, []);

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

  useEffect(() => {
    setPrivatePhotoState((current) => ({
      ...current,
      completed: localLifePhotoCount,
      total: words.filter((word) => Boolean(word.relatedMedia?.lifePhoto)).length,
      phase: localLifePhotoCount > 0 && localLifePhotoCount >= current.total ? 'complete' : current.phase,
    }));
  }, [localLifePhotoCount, words]);

  const hasPendingSettings = (Object.keys(settingsDraft) as (keyof EditableSettings)[])
    .some((field) => settingsDraft[field] !== settings[field]);
  const saveText = isSaving
    ? '正在保存并同步设置…'
    : hasPendingSettings
      ? '有尚未保存的修改，点击右下角“确定修改”后统一同步。'
    : lastSaveStatus === 'synced' && lastSavedAt
      ? `已保存并同步到服务器 · ${lastSavedAt}`
      : lastSaveStatus === 'pending' && lastSavedAt
        ? `已保存在本机，等待服务器连接后同步 · ${lastSavedAt}`
        : lastSaveStatus === 'error'
          ? '设置保存失败，请稍后重试。'
          : '修改学习设置后，点击“确定修改”一次保存并同步。';
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

  async function confirmSettings() {
    if (!hasPendingSettings || isSaving) return;
    await applySetting(settingsDraft);
  }

  function previewVoice(language: 'en' | 'zh', voiceURI: string) {
    void speakSequence([{
      text: language === 'en' ? 'Hello! Let us learn English together.' : '你好，我们一起来学习英语吧。',
      lang: language === 'en' ? 'en-GB' : 'zh-CN',
      voiceURI,
    }]);
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

  async function handlePrivatePhotoDownload() {
    if (privatePhotoState.phase === 'downloading') {
      privatePhotoAbortRef.current?.abort();
      return;
    }
    const abortController = new AbortController();
    privatePhotoAbortRef.current = abortController;
    setPrivatePhotoState((current) => ({
      ...current,
      phase: 'downloading',
      failed: 0,
      message: null,
    }));
    void requestPersistentImageStorage();

    try {
      const result = await onDownloadPrivateLifePhotos({
        signal: abortController.signal,
        onProgress: ({ completed, total, failed }) => {
          setPrivatePhotoState({
            phase: 'downloading',
            completed,
            total,
            failed,
            message: null,
          });
        },
      });
      setPrivatePhotoState({
        phase: result.failed > 0 ? 'error' : 'complete',
        completed: result.existing + result.downloaded,
        total: result.total,
        failed: result.failed,
        message: result.failed > 0 ? '部分照片下载失败，可以继续补齐。' : null,
      });
    } catch (caughtError) {
      setPrivatePhotoState((current) => ({
        ...current,
        phase: abortController.signal.aborted ? 'idle' : 'error',
        message: abortController.signal.aborted
          ? null
          : caughtError instanceof Error ? caughtError.message : '照片下载失败。',
      }));
    } finally {
      if (privatePhotoAbortRef.current === abortController) {
        privatePhotoAbortRef.current = null;
      }
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
  const privatePhotoPercent = privatePhotoState.total > 0
    ? Math.round((privatePhotoState.completed / privatePhotoState.total) * 100)
    : 0;
  const privatePhotoStatusText = privatePhotoState.message
    ?? (privatePhotoState.phase === 'downloading'
      ? `正在下载照片 ${privatePhotoState.completed}/${privatePhotoState.total}（${privatePhotoPercent}%）`
      : privatePhotoState.phase === 'complete'
        ? `已在本机保存全部 ${privatePhotoState.total} 张生活照片。`
        : privatePhotoState.completed > 0
          ? `本机已有 ${privatePhotoState.completed}/${privatePhotoState.total} 张，可继续补齐。`
          : `验证过家庭验证码后，可下载 ${privatePhotoState.total} 张生活照片。`);

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

        {/* ─── Unified settings console ─── */}
        <section className="settings-panel-grid">
          <section className="section-block settings-panel settings-panel--combined">
            <div className="section-block__header">
              <h2><span className="settings-panel__icon settings-panel__icon--info">⚙</span> 学习设置</h2>
              <p>调整学习负荷、学习体验和音色，确认后一次保存并同步。</p>
            </div>
            <div className="settings-unified-grid">
              <section className="settings-unified-group settings-unified-group--volume">
                <div className="settings-unified-group__header">
                  <h3>学习负荷</h3>
                  <p>设置每日任务数量</p>
                </div>
                <div className="settings-control-grid">
                  <SettingsNumberControl
                    icon="🌿"
                    label="每日新词"
                    description=""
                    value={settingsDraft.dailyNewWordCount}
                    min={MIN_NEW_WORD_COUNT}
                    suffix=" 个"
                    hint={`最少 ${MIN_NEW_WORD_COUNT} 个`}
                    onChange={(dailyNewWordCount) => setSettingsDraft((current) => ({ ...current, dailyNewWordCount }))}
                  />
                  <SettingsNumberControl
                    icon="🕐"
                    label="每日复习上限"
                    description=""
                    value={settingsDraft.dailyReviewLimit}
                    min={MIN_REVIEW_LIMIT}
                    suffix=" 个"
                    hint={`最少 ${MIN_REVIEW_LIMIT} 个`}
                    onChange={(dailyReviewLimit) => setSettingsDraft((current) => ({ ...current, dailyReviewLimit }))}
                  />
                </div>
              </section>

              <section className="settings-unified-group settings-unified-group--experience">
                <div className="settings-unified-group__header">
                  <h3>学习体验</h3>
                  <p>控制题目辅助内容</p>
                </div>
                <div className="settings-toggle-list">
                  <SettingsToggleRow
                    icon="🔊"
                    label="学习语音"
                    description="播放英文和中文发音。"
                    enabled={settingsDraft.enableAudio}
                    onToggle={() => setSettingsDraft((current) => ({ ...current, enableAudio: !current.enableAudio }))}
                  />
                  <SettingsToggleRow
                    icon="🖼"
                    label="图片题"
                    description="以图片形式呈现题目。"
                    enabled={settingsDraft.showImages}
                    onToggle={() => setSettingsDraft((current) => ({ ...current, showImages: !current.showImages }))}
                  />
                  <SettingsToggleRow
                    icon="❝"
                    label="例句展示"
                    description="展示真实语境例句。"
                    enabled={settingsDraft.showExamples}
                    onToggle={() => setSettingsDraft((current) => ({ ...current, showExamples: !current.showExamples }))}
                  />
                  <SettingsToggleRow
                    icon="✏️"
                    label="拼写提示"
                    description="拼写时提供字母提示。"
                    enabled={settingsDraft.showHints}
                    onToggle={() => setSettingsDraft((current) => ({ ...current, showHints: !current.showHints }))}
                  />
                </div>
              </section>

              <section className="settings-unified-group settings-unified-group--voice">
                <div className="settings-unified-group__header">
                  <h3>音色选择</h3>
                  <p>分别选择英文和中文发音</p>
                </div>
                <div className="settings-voice-list">
                  <SettingsVoiceSelect
                    icon="EN"
                    label="英文发音"
                    language="en"
                    value={settingsDraft.englishVoiceURI}
                    voices={englishVoices}
                    disabled={isSaving}
                    onChange={(englishVoiceURI) => setSettingsDraft((current) => ({ ...current, englishVoiceURI }))}
                    onPreview={() => previewVoice('en', settingsDraft.englishVoiceURI)}
                  />
                  <SettingsVoiceSelect
                    icon="中"
                    label="中文发音"
                    language="zh"
                    value={settingsDraft.chineseVoiceURI}
                    voices={chineseVoices}
                    disabled={isSaving}
                    onChange={(chineseVoiceURI) => setSettingsDraft((current) => ({ ...current, chineseVoiceURI }))}
                    onPreview={() => previewVoice('zh', settingsDraft.chineseVoiceURI)}
                  />
                </div>
              </section>
            </div>
            <button
              className="primary-button settings-unified-confirm"
              type="button"
              disabled={!hasPendingSettings || isSaving}
              onClick={() => void confirmSettings()}
            >
              {isSaving ? '保存并同步中…' : '确定修改'}
            </button>
          </section>

          {/* Right: 本地数据管理 */}
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
              <article className="settings-data-item settings-data-item--images">
                <span className="settings-data-item__icon">🔐</span>
                <div aria-live="polite">
                  <strong>下载照片</strong>
                  <p>{privatePhotoStatusText}</p>
                  {(privatePhotoState.phase === 'downloading' || privatePhotoState.completed > 0) && (
                    <span className="settings-image-download-progress" aria-hidden="true">
                      <span style={{ width: `${privatePhotoPercent}%` }} />
                    </span>
                  )}
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handlePrivatePhotoDownload()}
                >
                  {privatePhotoState.phase === 'downloading'
                    ? '停止下载'
                    : privatePhotoState.phase === 'complete'
                      ? '已完成'
                      : privatePhotoState.completed > 0 ? '继续下载' : '下载照片'}
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
