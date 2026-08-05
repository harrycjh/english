import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DailyTaskSummary } from '../models/daily-task';
import {
  addMonths,
  buildCheckInMonth,
  getMonthKey,
  summarizeCheckIns,
} from '../services/check-in';
import { getNextUnlock } from '../services/backpack';

interface CheckInCalendarDrawerProps {
  isOpen: boolean;
  tasks: DailyTaskSummary[];
  todayKey: string;
  onClose: () => void;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function CheckInCalendarDrawer({ isOpen, tasks, todayKey, onClose }: CheckInCalendarDrawerProps) {
  // An offset rather than a month key, so closing the drawer can put it back to
  // this month with one reset instead of remembering what "this month" was.
  const [monthOffset, setMonthOffset] = useState(0);
  if (!isOpen) return null;

  function close() {
    setMonthOffset(0);
    onClose();
  }

  const summary = summarizeCheckIns(tasks, todayKey);
  const monthKey = addMonths(getMonthKey(todayKey), monthOffset);
  const month = buildCheckInMonth(tasks, monthKey, todayKey);
  const nextUnlock = getNextUnlock(summary.totalDays);

  const drawer = (
    <div className="new-word-queue-backdrop" onClick={close}>
      <aside
        className="new-word-queue"
        aria-label="月度签到"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="new-word-queue__header">
          <div>
            <span><CalendarCheck size={18} aria-hidden="true" /> 每日签到</span>
            <h2>{summary.isTodayCheckedIn ? '今天已经签到' : '今天还没签到'}</h2>
          </div>
          <button type="button" aria-label="关闭签到日历" onClick={close}>
            <X aria-hidden="true" />
          </button>
        </header>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>连续签到</h3>
              <p>
                {summary.isTodayCheckedIn
                  ? '完成当天的新词和复习就算签到，明天继续就能接上。'
                  : '完成今天的新词和复习就会盖上今天的印章。'}
              </p>
            </div>
            <strong className="check-in-calendar__streak">{summary.streakDays}<small> 天</small></strong>
          </div>
          <ul className="check-in-calendar__totals">
            <li>
              <span>累计签到</span>
              <strong>{summary.totalDays} 天</strong>
            </li>
            <li>
              <span>{month.month} 月签到</span>
              <strong>{month.checkedInCount} 天</strong>
            </li>
            <li>
              <span>下一件道具</span>
              <strong>
                {nextUnlock ? `还差 ${nextUnlock.requiredDays - summary.totalDays} 天` : '已全部集齐'}
              </strong>
            </li>
          </ul>
        </section>

        <section className="new-word-queue__section">
          <div className="check-in-calendar__month-bar">
            <button
              type="button"
              aria-label="上个月"
              onClick={() => setMonthOffset(monthOffset - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong>{month.year} 年 {month.month} 月</strong>
            <button
              type="button"
              aria-label="下个月"
              disabled={monthOffset >= 0}
              onClick={() => setMonthOffset(monthOffset + 1)}
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
                title={`${day.dateKey}${day.isCheckedIn ? ' · 已签到' : day.isFuture ? '' : ' · 未完成'}`}
              >
                {day.dayOfMonth}
              </span>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );

  if (typeof document === 'undefined') return drawer;
  const portalHost = document.querySelector('.ipad-stage-shell');
  return createPortal(drawer, portalHost ?? document.body);
}
