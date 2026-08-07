import { useState } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  Sparkles,
  X,
} from 'lucide-react';
import type { DailyTaskSummary, SessionResult } from '../models/daily-task';
import type { ProfileId } from '../models/parent-setting';
import { useInertialHorizontalScroll } from '../hooks/useInertialHorizontalScroll';
import {
  addMonths,
  buildCheckInMonth,
  getMonthKey,
  summarizeCheckIns,
} from '../services/check-in';
import {
  type BackpackItem,
  getItemArtUrl,
  getNextUnlock,
  listRewardItems,
  resolveBackpackDays,
} from '../services/backpack';

interface CheckInPageProps {
  tasks: DailyTaskSummary[];
  todayKey: string;
  sessionResult?: SessionResult | null;
  unlockAll?: boolean;
  profileId?: ProfileId;
  onCheckIn: () => Promise<void>;
  onBackHome: () => void;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const MAX_FUTURE_MONTHS = 12;

export function CheckInPage({
  tasks,
  todayKey,
  sessionResult = null,
  unlockAll = false,
  profileId = 'cute-junjun',
  onCheckIn,
  onBackHome,
}: CheckInPageProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedReward, setSelectedReward] = useState<BackpackItem | null>(null);
  const {
    scrollRef: rewardTrackRef,
    pointerHandlers: rewardPointerHandlers,
    consumeMouseDrag,
  } = useInertialHorizontalScroll();
  const summary = summarizeCheckIns(tasks, todayKey);
  const monthKey = addMonths(getMonthKey(todayKey), monthOffset);
  const month = buildCheckInMonth(tasks, monthKey, todayKey);
  const backpackDays = resolveBackpackDays(summary.totalDays, unlockAll);
  const nextUnlock = getNextUnlock(backpackDays);
  const rewards = listRewardItems();
  const finalRewardDay = rewards.at(-1)?.requiredDays ?? 0;
  const progressDays = Math.min(summary.totalDays, finalRewardDay);
  const rewardProgress = finalRewardDay > 0 ? (progressDays / finalRewardDay) * 100 : 100;
  const trailingCalendarBlanks = Math.max(
    0,
    42 - month.leadingBlanks - month.days.length,
  );

  async function submitCheckIn() {
    if (summary.isTodayCheckedIn || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onCheckIn();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '签到失败，请稍后再试。');
    } finally {
      setIsSubmitting(false);
    }
  }

  function openReward(reward: BackpackItem) {
    if (consumeMouseDrag()) return;
    setSelectedReward(reward);
  }

  return (
    <main className="page page--check-in">
      <div className="check-in-page__sun" aria-hidden="true" />
      <div className="check-in-page__cloud check-in-page__cloud--one" aria-hidden="true" />
      <div className="check-in-page__cloud check-in-page__cloud--two" aria-hidden="true" />

      <header className="check-in-page__topbar">
        <button type="button" className="check-in-page__back" onClick={onBackHome}>
          <ArrowLeft size={20} aria-hidden="true" />
          返回首页
        </button>
      </header>

      <div className="check-in-page__layout">
        <section className="check-in-page__hero" aria-labelledby="check-in-title">
          <span className="check-in-page__eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            每日成长印章
          </span>
          <div className="check-in-page__action-stack">
            <h1 id="check-in-title">
              {summary.isTodayCheckedIn ? '今天已签到' : '今天还没签到'}
            </h1>
            <p className="check-in-page__lead">
              {sessionResult
                ? '今日单词全部完成，把这份认真留在今天。'
                : summary.isTodayCheckedIn
                  ? '今天的印章已经收好，明天再来接着走。'
                  : '来到这里就可以手动签到，完成学习后也会自动来到这一页。'}
            </p>

            {sessionResult ? (
              <div className="check-in-page__result" aria-label="今日学习结果">
                <span><strong>{sessionResult.totalAnswered}</strong> 道题</span>
                <span><strong>答对 {sessionResult.correctCount}</strong></span>
                <span><strong>答错 {sessionResult.wrongCount}</strong></span>
              </div>
            ) : null}

            <div className="check-in-page__stamp-wrap">
              <span className="check-in-page__stamp-ring" aria-hidden="true" />
              <button
                type="button"
                className={`check-in-page__stamp-button${summary.isTodayCheckedIn ? ' is-checked' : ''}`}
                disabled={summary.isTodayCheckedIn || isSubmitting}
                onClick={() => void submitCheckIn()}
              >
                {summary.isTodayCheckedIn ? (
                  <>
                    <Check size={42} strokeWidth={3} aria-hidden="true" />
                    <strong>签到成功</strong>
                    <small>已收下今天的印章</small>
                  </>
                ) : (
                  <>
                    <CalendarCheck size={40} strokeWidth={2.2} aria-hidden="true" />
                    <strong>{isSubmitting ? '正在盖章…' : '确认签到'}</strong>
                    <small>轻轻按一下</small>
                  </>
                )}
              </button>
            </div>
            {submitError ? <p className="check-in-page__error" role="alert">{submitError}</p> : null}

            <ul className="check-in-page__totals">
              <li>
                <span>连续签到</span>
                <strong>{summary.streakDays}<small> 天</small></strong>
              </li>
              <li>
                <span>累计签到</span>
                <strong>{summary.totalDays}<small> 天</small></strong>
              </li>
              <li>
                <span>下一件道具</span>
                <strong>
                  {nextUnlock ? `还差 ${nextUnlock.requiredDays - summary.totalDays} 天` : '已全部集齐'}
                </strong>
              </li>
            </ul>
          </div>
        </section>

        <section className="check-in-page__calendar" aria-label="月度签到日历">
          <div className="check-in-page__calendar-heading">
            <div>
              <span>MY LITTLE STEPS</span>
              <h2>成长日历</h2>
            </div>
            <strong>{month.checkedInCount}<small> 天</small></strong>
          </div>

          <div className="check-in-calendar__month-bar">
            <button
              type="button"
              aria-label="上个月"
              onClick={() => setMonthOffset((offset) => offset - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong>{month.year} 年 {month.month} 月</strong>
            <button
              type="button"
              aria-label="下个月"
              disabled={monthOffset >= MAX_FUTURE_MONTHS}
              onClick={() => setMonthOffset((offset) => offset + 1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="check-in-calendar__weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="check-in-calendar__grid">
            {Array.from({ length: month.leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} className="check-in-calendar__blank" />
            ))}
            {month.days.map((day) => (
              <span
                key={day.dateKey}
                className={[
                  'check-in-calendar__day',
                  day.isCheckedIn ? 'is-checked' : '',
                  day.isToday ? 'is-today' : '',
                  day.isFuture ? 'is-future' : '',
                ].filter(Boolean).join(' ')}
                data-date-key={day.dateKey}
                title={`${day.dateKey}${day.isCheckedIn ? ' · 已签到' : day.isFuture ? '' : ' · 未签到'}`}
              >
                {day.dayOfMonth}
              </span>
            ))}
            {Array.from({ length: trailingCalendarBlanks }, (_, index) => (
              <span key={`trailing-blank-${index}`} className="check-in-calendar__blank" />
            ))}
          </div>
          <p className="check-in-page__calendar-note">
            <span aria-hidden="true">✦</span>
            每一个印章，都是今天认真来过的证明。
          </p>
        </section>
      </div>

      <section className="check-in-page__reward-timeline" aria-labelledby="reward-timeline-title">
        <div className="check-in-page__reward-heading">
          <span className="check-in-page__reward-icon" aria-hidden="true"><Gift size={18} /></span>
          <div>
            <h2 id="reward-timeline-title">接下来的奖励</h2>
            <p>每签到 7 天，打开一份新的旅行礼物</p>
          </div>
        </div>
        <div className="check-in-page__reward-content">
          <div
            ref={rewardTrackRef}
            className="check-in-page__reward-track"
            aria-label="全部签到奖励，可横向拖动"
            {...rewardPointerHandlers}
          >
            <div className="check-in-page__reward-strip">
              <div className="check-in-page__reward-stops">
                {rewards.map((reward) => {
                  const isEarned = backpackDays >= reward.requiredDays;
                  return (
                    <button
                      key={`${reward.slot}:${reward.id}`}
                      type="button"
                      className={`check-in-page__reward-stop${isEarned ? ' is-earned' : ''}`}
                      aria-label={`放大查看${reward.name}`}
                      data-reward-day={reward.requiredDays}
                      onClick={() => openReward(reward)}
                    >
                      <span className="check-in-page__reward-thumb">
                        <img
                          src={getItemArtUrl(reward, profileId)}
                          alt=""
                          draggable={false}
                        />
                      </span>
                      <span className="check-in-page__reward-copy">
                        <strong>第 {reward.requiredDays} 天</strong>
                        {isEarned ? <em>已得到</em> : null}
                        <small>{reward.name}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                className="check-in-page__reward-progress"
                aria-label={`签到进度：已签到${progressDays}天`}
              >
                <span className="check-in-page__reward-progress-rail">
                  <span style={{ width: `${rewardProgress}%` }} />
                </span>
                <strong
                  style={{ left: `${Math.max(1.25, Math.min(rewardProgress, 98.75))}%` }}
                >
                  已签到{progressDays}天
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedReward ? (
        <div
          className="check-in-page__reward-lightbox"
          role="presentation"
          onClick={() => setSelectedReward(null)}
        >
          <section
            className="check-in-page__reward-preview"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedReward.name}奖励预览`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="check-in-page__reward-close"
              aria-label="关闭奖励预览"
              onClick={() => setSelectedReward(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <img
              src={getItemArtUrl(selectedReward, profileId)}
              alt={selectedReward.name}
            />
            <div>
              <span>第 {selectedReward.requiredDays} 天奖励</span>
              <h2>{selectedReward.name}</h2>
              <p>{selectedReward.hint}</p>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
