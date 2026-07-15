import { useEffect, useId, useRef, useState } from 'react';
import type { ProfileId } from '../models/parent-setting';

export interface ProfileOption {
  id: ProfileId;
  label: string;
  icon: string;
}

export const PROFILE_OPTIONS: ProfileOption[] = [
  { id: 'cute-junjun', label: '可爱的小珺珺', icon: '👧' },
  { id: 'stinky-dog', label: '臭臭的小狗子', icon: '🐶' },
  { id: 'fragrant-rabbit', label: '香香的小兔子', icon: '🐰' },
];

interface ProfileSelectorProps {
  value: ProfileId;
  buttonClassName: string;
  onChange: (profileId: ProfileId) => void | Promise<void>;
}

export function ProfileSelector({ value, buttonClassName, onChange }: ProfileSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selectedProfile = PROFILE_OPTIONS.find((option) => option.id === value) ?? PROFILE_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(profileId: ProfileId) {
    setIsOpen(false);
    void onChange(profileId);
  }

  return (
    <div className="app-profile-selector" ref={rootRef}>
      <button
        className={buttonClassName}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="app-profile-selector__current-icon" aria-hidden="true">
          {selectedProfile.icon}
        </span>
        <span>{selectedProfile.label}</span>
      </button>
      <div className="app-profile-selector__menu" id={menuId} role="menu" hidden={!isOpen}>
        {PROFILE_OPTIONS.map((option) => (
          <button
            className={`app-profile-selector__option${option.id === selectedProfile.id ? ' is-selected' : ''}`}
            type="button"
            role="menuitemradio"
            aria-checked={option.id === selectedProfile.id}
            key={option.id}
            onClick={() => handleSelect(option.id)}
          >
            <span className="app-profile-selector__option-icon" aria-hidden="true">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
