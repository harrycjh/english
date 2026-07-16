import { BookOpen, ChartPie, LayoutGrid, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

export type BottomDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

interface BottomDockProps {
  active: BottomDockGlyph;
  onOpenReview: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
}

/**
 * Unified bottom navigation dock shared by the selection / stats / settings
 * pages. It is pinned to the bottom of the viewport so it stays visible while
 * the page scrolls, and reuses the review page's icon slices so every page
 * shows the exact same dock.
 */
export function BottomDock({
  active,
  onOpenReview,
  onOpenSelection,
  onOpenStats,
  onOpenSettings,
}: BottomDockProps) {
  const items: Array<{ glyph: BottomDockGlyph; label: string; icon: LucideIcon; onClick: () => void }> = [
    { glyph: 'review', label: '复习', icon: BookOpen, onClick: onOpenReview },
    { glyph: 'selection', label: '选词', icon: LayoutGrid, onClick: onOpenSelection },
    { glyph: 'stats', label: '统计', icon: ChartPie, onClick: onOpenStats },
    { glyph: 'settings', label: '设置', icon: SettingsIcon, onClick: onOpenSettings },
  ];
  const activeIndex = items.findIndex((item) => item.glyph === active);
  const dockStyle = { '--dock-active-index': activeIndex } as CSSProperties;

  return (
    <nav className="app-bottom-dock" aria-label="主页面导航" data-active={active} style={dockStyle}>
      <span className="app-bottom-dock__indicator" aria-hidden="true">
        <span key={active} className="app-bottom-dock__indicator-surface" />
      </span>
      {items.map((item) => {
        const isActive = item.glyph === active;
        const Icon = item.icon;
        return (
          <button
            key={item.glyph}
            type="button"
            className={`app-bottom-dock__button${isActive ? ' is-active' : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={isActive ? undefined : item.onClick}
          >
            <Icon className="app-bottom-dock__icon" aria-hidden="true" strokeWidth={2.8} />
            <span className="app-bottom-dock__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
