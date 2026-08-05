import { describe, expect, it } from 'vitest';
import {
  BACKPACK_ITEMS,
  DEFAULT_ITEM_ID,
  countOwnedItems,
  getItemArtUrl,
  getNextUnlock,
  isItemOwned,
  listSlotItems,
  resolveEquippedItem,
} from './backpack';

describe('backpack', () => {
  it('gives every slot something to wear from day one', () => {
    for (const slot of ['mascot', 'focus'] as const) {
      const free = listSlotItems(slot).filter((item) => item.requiredDays === 0);
      expect(free).toHaveLength(1);
      expect(free[0].id).toBe(DEFAULT_ITEM_ID);
    }
  });

  it('unlocks an item the day the count reaches its price', () => {
    const reading = listSlotItems('mascot').find((item) => item.id === 'reading')!;

    expect(reading.requiredDays).toBe(3);
    expect(isItemOwned(reading, 2)).toBe(false);
    expect(isItemOwned(reading, 3)).toBe(true);
  });

  it('counts what is owned as the days add up', () => {
    // Two free items to start with, and the first unlock is priced at 3 days.
    expect(countOwnedItems(0)).toBe(2);
    expect(countOwnedItems(2)).toBe(2);
    expect(countOwnedItems(3)).toBe(3);
    expect(countOwnedItems(999)).toBe(BACKPACK_ITEMS.length);
  });

  it('names the cheapest item still locked', () => {
    expect(getNextUnlock(0)?.requiredDays).toBe(3);
    expect(getNextUnlock(3)?.requiredDays).toBe(5);
    expect(getNextUnlock(999)).toBeNull();
  });

  it('wears the requested item once it is owned', () => {
    expect(resolveEquippedItem('mascot', 'cyber', 15).id).toBe('cyber');
    expect(resolveEquippedItem('focus', 'meadow', 5).id).toBe('meadow');
  });

  it('falls back to the free item for anything it cannot honour', () => {
    // Not earned yet, from another slot, and outright unknown.
    expect(resolveEquippedItem('mascot', 'cyber', 14).id).toBe(DEFAULT_ITEM_ID);
    expect(resolveEquippedItem('mascot', 'meadow', 999).id).toBe(DEFAULT_ITEM_ID);
    expect(resolveEquippedItem('focus', 'from-a-later-version', 999).id).toBe(DEFAULT_ITEM_ID);
    expect(resolveEquippedItem('mascot', DEFAULT_ITEM_ID, 0).slot).toBe('mascot');
  });

  it('lets the 每日伙伴 item follow the profile', () => {
    const item = resolveEquippedItem('mascot', DEFAULT_ITEM_ID, 0);

    expect(getItemArtUrl(item, 'stinky-dog')).toContain('review-dog-scene-v1.webp');
    expect(getItemArtUrl(item, 'cute-junjun')).toContain('review-junjun-cutout-v1.webp');
    expect(getItemArtUrl(item, 'fragrant-rabbit')).toContain('review-bunny-scene.png');
  });
});
