interface AudioIconButtonProps {
  onClick: () => void;
  className?: string;
}

export function AudioIconButton({ onClick, className }: AudioIconButtonProps) {
  const buttonClassName = className ? `audio-icon-button ${className}` : 'audio-icon-button';

  return (
    <button
      className={buttonClassName}
      type="button"
      aria-label="播放英文发音"
      title="播放英文发音"
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 9v6h4l5 4V5L7 9H3Z" fill="currentColor" />
        <path
          d="M16.5 8.5a5 5 0 0 1 0 7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <path
          d="M18.8 6a8.5 8.5 0 0 1 0 12"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </button>
  );
}