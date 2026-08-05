import { createPortal } from 'react-dom';
import { Backpack, Check, Lock, X } from 'lucide-react';
import type { ProfileId } from '../models/parent-setting';
import {
  BACKPACK_ITEMS,
  type BackpackItem,
  type BackpackSlot,
  countOwnedItems,
  getItemArtUrl,
  isItemOwned,
  listSlotItems,
} from '../services/backpack';

interface BackpackDrawerProps {
  isOpen: boolean;
  profileId: ProfileId;
  totalCheckInDays: number;
  mascotSceneId: string;
  focusSceneId: string;
  onEquip: (slot: BackpackSlot, itemId: string) => void;
  onClose: () => void;
}

const SLOT_SECTIONS: { slot: BackpackSlot; title: string; description: string }[] = [
  { slot: 'mascot', title: '伙伴', description: '换掉复习页左上角的那幅画' },
  { slot: 'focus', title: '小屋背景', description: '换掉今日重点卡片的底图' },
];

export function BackpackDrawer({
  isOpen,
  profileId,
  totalCheckInDays,
  mascotSceneId,
  focusSceneId,
  onEquip,
  onClose,
}: BackpackDrawerProps) {
  if (!isOpen) return null;

  const equippedBySlot: Record<BackpackSlot, string> = {
    mascot: mascotSceneId,
    focus: focusSceneId,
  };
  const ownedCount = countOwnedItems(totalCheckInDays);

  function renderItem(item: BackpackItem) {
    const isOwned = isItemOwned(item, totalCheckInDays);
    const isEquipped = isOwned && equippedBySlot[item.slot] === item.id;
    return (
      <li key={`${item.slot}-${item.id}`}>
        <button
          type="button"
          className={[
            'backpack-item',
            isEquipped ? 'is-equipped' : '',
            isOwned ? '' : 'is-locked',
          ].filter(Boolean).join(' ')}
          disabled={!isOwned}
          aria-pressed={isEquipped}
          data-item-id={item.id}
          data-slot={item.slot}
          onClick={() => onEquip(item.slot, item.id)}
        >
          <span
            className="backpack-item__art"
            style={{ backgroundImage: `url('${getItemArtUrl(item, profileId)}')` }}
            aria-hidden="true"
          >
            {isOwned ? null : <Lock size={18} aria-hidden="true" />}
            {isEquipped ? <Check size={16} aria-hidden="true" /> : null}
          </span>
          <span className="backpack-item__text">
            <strong>{item.name}</strong>
            <small>
              {isOwned ? item.hint : `还需 ${item.requiredDays - totalCheckInDays} 天签到`}
            </small>
          </span>
        </button>
      </li>
    );
  }

  const drawer = (
    <div className="new-word-queue-backdrop" onClick={onClose}>
      <aside
        className="new-word-queue"
        aria-label="背包"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="new-word-queue__header">
          <div>
            <span><Backpack size={18} aria-hidden="true" /> 背包</span>
            <h2>已收集 {ownedCount} / {BACKPACK_ITEMS.length} 件</h2>
          </div>
          <button type="button" aria-label="关闭背包" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {SLOT_SECTIONS.map((section) => (
          <section className="new-word-queue__section" key={section.slot}>
            <div className="new-word-queue__section-heading">
              <div>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
            </div>
            <ul className="backpack-item-list">
              {listSlotItems(section.slot).map(renderItem)}
            </ul>
          </section>
        ))}

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>道具从哪来</h3>
              <p>每天把新词和复习都做完就算签到，累计的签到天数会解锁新的道具。</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );

  if (typeof document === 'undefined') return drawer;
  const portalHost = document.querySelector('.ipad-stage-shell');
  return createPortal(drawer, portalHost ?? document.body);
}
