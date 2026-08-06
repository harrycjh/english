import { describe, expect, it } from 'vitest';
import type { BackpackItem } from './backpack';
import { CHECK_IN_HISTORY_DAYS } from './check-in';
import {
  BACKPACK_ITEMS,
  DEFAULT_ITEM_ID,
  countOwnedItems,
  getFocusSceneBackground,
  getItemArtUrl,
  getNextUnlock,
  isItemOwned,
  listSlotItems,
  resolveBackpackDays,
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

  it('keeps both slots earning as the days add up', () => {
    // A slot that stops unlocking is a slot the child stops opening, so no
    // slot may sit still for longer than the whole ladder took to get going.
    for (const slot of ['mascot', 'focus'] as const) {
      const prices = listSlotItems(slot).map((item) => item.requiredDays);

      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      for (let index = 1; index < prices.length; index += 1) {
        expect(prices[index] - prices[index - 1]).toBeLessThanOrEqual(5);
      }
    }
  });

  it('keeps every price inside the history the app can actually count', () => {
    // totalDays comes from the loaded check-in history, so a price above that
    // window is an item nobody can ever buy -- and nothing else would say so.
    const dearest = Math.max(...BACKPACK_ITEMS.map((item) => item.requiredDays));

    expect(dearest).toBeLessThanOrEqual(CHECK_IN_HISTORY_DAYS);
  });

  it('files Mia的家 as a background rather than a companion', () => {
    // It is a house, and the mascot slot is where the rabbit lives.
    const free = listSlotItems('focus').find((item) => item.requiredDays === 0)!;

    expect(free.name).toBe('Mia的家');
    expect(listSlotItems('mascot').map((item) => item.name)).not.toContain('Mia的家');
  });

  it('wears the requested item once it is owned', () => {
    expect(resolveEquippedItem('mascot', 'cyber', 8).id).toBe('cyber');
    expect(resolveEquippedItem('focus', 'meadow', 5).id).toBe('meadow');
  });

  it('falls back to the free item for anything it cannot honour', () => {
    // Not earned yet, from another slot, and outright unknown.
    expect(resolveEquippedItem('mascot', 'cyber', 7).id).toBe(DEFAULT_ITEM_ID);
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

describe('getFocusSceneBackground', () => {
  function focusItem(overrides: Partial<BackpackItem> = {}): BackpackItem {
    return {
      id: 'landmark',
      slot: 'focus',
      name: '地标',
      hint: '',
      requiredDays: 20,
      artFile: 'landmark.webp',
      ...overrides,
    };
  }

  it('scrims art that was never asked to leave room for the text', () => {
    const background = getFocusSceneBackground(focusItem(), 'cute-junjun')!;

    expect(background.startsWith('linear-gradient(96deg')).toBe(true);
    expect(background).toContain("url('/design-reference/slices/landmark.webp')");
    expect(background).toContain('center 58% / cover no-repeat');
  });

  it('leaves art drawn to the slot spec unscrimmed', () => {
    // The whole point of drawing the margin in is that the picture keeps its
    // colour on the left instead of being washed out by a scrim it does not
    // need — so a scrim here would undo the work.
    const background = getFocusSceneBackground(focusItem({ hasBuiltInMargin: true }), 'cute-junjun')!;

    expect(background).not.toContain('96deg');
    expect(background).toContain('landmark.webp');
  });

  it('honours a per-item framing', () => {
    const background = getFocusSceneBackground(focusItem({ focusArtPosition: 'center 30%' }), 'cute-junjun')!;

    expect(background).toContain('center 30% / cover');
  });

  it('paints the free scene like any other', () => {
    // It stopped being a special case when 晨光小路 was swapped for Mia的家:
    // the stylesheet rule that used to carry it was a second place to remember.
    const background = getFocusSceneBackground(focusItem({ id: DEFAULT_ITEM_ID }), 'cute-junjun');

    expect(background).toContain('landmark.webp');
  });

  it('paints nothing for mascot items or for art it has not got', () => {
    // Mascot art is framed by CSS, and there is nothing to paint without a file.
    expect(getFocusSceneBackground(focusItem({ slot: 'mascot' }), 'cute-junjun')).toBeNull();
    expect(getFocusSceneBackground(focusItem({ artFile: null }), 'cute-junjun')).toBeNull();
  });
});

describe('resolveBackpackDays', () => {
  it('leaves an ordinary profile with exactly the days it has earned', () => {
    expect(resolveBackpackDays(0, false)).toBe(0);
    expect(resolveBackpackDays(9, false)).toBe(9);
  });

  it('hands the debug profile enough days for every item in the catalogue', () => {
    const days = resolveBackpackDays(0, true);

    expect(countOwnedItems(days)).toBe(BACKPACK_ITEMS.length);
    expect(getNextUnlock(days)).toBeNull();
    // Every item, not just the ones that existed when this test was written.
    for (const item of BACKPACK_ITEMS) {
      expect(isItemOwned(item, days)).toBe(true);
    }
  });

  it('never walks a long-running child backwards', () => {
    const beyondTheCatalogue = BACKPACK_ITEMS
      .reduce((most, item) => Math.max(most, item.requiredDays), 0) + 100;

    expect(resolveBackpackDays(beyondTheCatalogue, true)).toBe(beyondTheCatalogue);
  });
});
