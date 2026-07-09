export type BottomDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

interface BottomDockProps {
  active: BottomDockGlyph;
  onOpenReview: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
}

function getBottomDockButtonUrl(glyph: BottomDockGlyph, active: boolean): string {
  if (glyph === 'review' && active) {
    return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-review-active-latest.png?v=8`;
  }
  const state = active ? 'active' : 'default';
  return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-${glyph}-${state}-transparent.png?v=2`;
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
  const items: Array<{ glyph: BottomDockGlyph; label: string; onClick: () => void }> = [
    { glyph: 'review', label: '复习', onClick: onOpenReview },
    { glyph: 'selection', label: '选词', onClick: onOpenSelection },
    { glyph: 'stats', label: '统计', onClick: onOpenStats },
    { glyph: 'settings', label: '设置', onClick: onOpenSettings },
  ];

  return (
    <nav className="app-bottom-dock" aria-label="主页面导航">
      {items.map((item) => {
        const isActive = item.glyph === active;
        return (
          <button
            key={item.glyph}
            type="button"
            className={`app-bottom-dock__button${isActive ? ' is-active' : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={isActive ? undefined : item.onClick}
            style={{ backgroundImage: `url(${getBottomDockButtonUrl(item.glyph, isActive)})` }}
          >
            <span className="app-bottom-dock__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
