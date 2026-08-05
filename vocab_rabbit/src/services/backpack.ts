import type { ProfileId } from '../models/parent-setting';

/** Which piece of the review page an item dresses. */
export type BackpackSlot = 'mascot' | 'focus';

export interface BackpackItem {
  id: string;
  slot: BackpackSlot;
  name: string;
  hint: string;
  /**
   * Total 签到 days needed to own it. Zero means it comes with the app — every
   * slot needs one of those, or a brand-new child opens an empty backpack.
   */
  requiredDays: number;
  /**
   * Art file under `/design-reference/slices/`, or null for the item that
   * follows the current profile. `scripts/backpack-art.test.ts` proves the file
   * ships and that the stylesheet can reach it.
   */
  artFile: string | null;
  /**
   * `background-position` for focus scenes. Landscape art is usually framed a
   * little below centre, so the horizon lands under the text rather than
   * through it. Ignored by mascot items, which are framed in CSS.
   */
  focusArtPosition?: string;
  /**
   * True when the art was drawn to this slot's spec, with its left 62% already
   * left quiet for the text. Those skip the scrim; borrowed art needs it.
   */
  hasBuiltInMargin?: boolean;
}

export const DEFAULT_ITEM_ID = 'default';

/**
 * Everything the backpack can hold.
 *
 * Prices climb slowly and alternate between the two slots, so there is always
 * something close enough to be worth another day: 3, 5, 7, 12, 15.
 */
export const BACKPACK_ITEMS: BackpackItem[] = [
  {
    id: DEFAULT_ITEM_ID,
    slot: 'mascot',
    name: '每日伙伴',
    hint: '跟着当前的小主人变化',
    requiredDays: 0,
    artFile: null,
  },
  {
    id: 'reading',
    slot: 'mascot',
    name: '读书时光',
    hint: '在窗边把绘本读完',
    requiredDays: 3,
    artFile: 'stats-rabbit-reading-v1.webp',
  },
  {
    id: 'cyber',
    slot: 'mascot',
    name: '星夜特工',
    hint: '霓虹城里的夜间任务',
    requiredDays: 8,
    artFile: 'settings-cyber-rabbit-hero.webp',
  },
  {
    id: DEFAULT_ITEM_ID,
    slot: 'focus',
    name: '晨光小路',
    hint: '清晨的坡道和小屋',
    requiredDays: 0,
    artFile: 'review-focus-art.png',
  },
  {
    id: 'meadow',
    slot: 'focus',
    name: '青草坡屋',
    hint: '雨后的草坡和白栅栏',
    requiredDays: 5,
    artFile: 'stats-rhythm-house-v1.webp',
    focusArtPosition: 'center 64%',
  },
  {
    id: 'cottage',
    slot: 'focus',
    name: '山谷小屋',
    hint: '花园尽头的小房子',
    requiredDays: 7,
    artFile: 'selection-plan-house-background.webp',
  },
  {
    id: 'kennel',
    slot: 'focus',
    name: '小狗的家',
    hint: '木头狗屋和一丛野花',
    requiredDays: 12,
    artFile: 'settings-task-impact-doghouse-v1.webp',
    focusArtPosition: 'center 56%',
  },
  {
    id: 'beijing',
    slot: 'focus',
    name: '北京',
    hint: '晨光里的祈年殿',
    requiredDays: 16,
    artFile: 'scene-beijing.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'harbin',
    slot: 'focus',
    name: '哈尔滨',
    hint: '雪后的索菲亚教堂',
    requiredDays: 20,
    artFile: 'scene-harbin.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'shanghai',
    slot: 'focus',
    name: '上海',
    hint: '春天的外滩和东方明珠',
    requiredDays: 24,
    artFile: 'scene-shanghai.webp',
    hasBuiltInMargin: true,
  },
];

/** Art the 每日伙伴 item shows, which is whatever the current profile wears. */
const PROFILE_MASCOT_ART: Record<ProfileId, string> = {
  'cute-junjun': 'review-junjun-cutout-v1.webp',
  'stinky-dog': 'review-dog-scene-v1.webp',
  'fragrant-rabbit': 'review-bunny-scene.png',
};

export function listSlotItems(slot: BackpackSlot): BackpackItem[] {
  return BACKPACK_ITEMS.filter((item) => item.slot === slot);
}

export function isItemOwned(item: BackpackItem, totalCheckInDays: number): boolean {
  return totalCheckInDays >= item.requiredDays;
}

export function countOwnedItems(totalCheckInDays: number): number {
  return BACKPACK_ITEMS.filter((item) => isItemOwned(item, totalCheckInDays)).length;
}

/**
 * The item a slot actually wears.
 *
 * A saved id is not trusted: settings sync between devices and survive app
 * updates, so an id can arrive that this build has never heard of, or one the
 * child has since... not earned, because days only ever accumulate — but a
 * restored backup or a cleared history can walk the count backwards. Either way
 * the page has to render something, and that something is the free item.
 */
export function resolveEquippedItem(
  slot: BackpackSlot,
  requestedId: string,
  totalCheckInDays: number,
): BackpackItem {
  const items = listSlotItems(slot);
  const requested = items.find((item) => item.id === requestedId);
  if (requested && isItemOwned(requested, totalCheckInDays)) return requested;
  return items.find((item) => item.id === DEFAULT_ITEM_ID)!;
}

/** The cheapest item not owned yet, so the calendar can name a reason to return. */
export function getNextUnlock(totalCheckInDays: number): BackpackItem | null {
  const locked = BACKPACK_ITEMS
    .filter((item) => !isItemOwned(item, totalCheckInDays))
    .sort((left, right) => left.requiredDays - right.requiredDays);
  return locked[0] ?? null;
}

export function getItemArtUrl(item: BackpackItem, profileId: ProfileId): string {
  return `/design-reference/slices/${item.artFile ?? PROFILE_MASCOT_ART[profileId]}`;
}

/**
 * The scrim that keeps the focus card's text legible over borrowed art.
 *
 * Art drawn to this slot's spec already leaves its left 62% quiet, and laying a
 * scrim over that only washes out a picture that did not need the help.
 */
const FOCUS_SCRIM = 'linear-gradient(96deg, rgba(255, 251, 238, 0.95) 0 30%, rgba(255, 249, 228, 0.66) 54%, rgba(255, 247, 222, 0.14) 80%, rgba(255, 246, 220, 0.04) 100%)';

/**
 * The whole background shorthand for an equipped focus scene, or null for the
 * built-in art that the stylesheet already paints.
 *
 * Driving this from the catalogue rather than a rule per item is what makes
 * adding a scene a one-line change: a hand-written stylesheet rule that nobody
 * remembers to add is a scene that silently keeps the old picture.
 */
export function getFocusSceneBackground(item: BackpackItem, profileId: ProfileId): string | null {
  if (item.slot !== 'focus' || item.id === DEFAULT_ITEM_ID) return null;
  const layers = [
    ...(item.hasBuiltInMargin ? [] : [FOCUS_SCRIM]),
    `url('${getItemArtUrl(item, profileId)}') ${item.focusArtPosition ?? 'center 58%'} / cover no-repeat`,
  ];
  return layers.join(', ');
}
