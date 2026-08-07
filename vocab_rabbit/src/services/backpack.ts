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
export const REWARD_INTERVAL_DAYS = 7;

/**
 * Everything the backpack can hold.
 *
 * Starter companions and scenes are direct gifts. The earned ladder begins
 * with Beijing and places one new travel scene on every seventh day.
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
    requiredDays: 0,
    artFile: 'stats-rabbit-reading-v1.webp',
  },
  {
    id: 'cyber',
    slot: 'mascot',
    name: '星夜特工',
    hint: '霓虹城里的夜间任务',
    requiredDays: 0,
    artFile: 'settings-cyber-rabbit-hero.webp',
  },
  {
    id: DEFAULT_ITEM_ID,
    slot: 'focus',
    name: 'Mia的家',
    hint: '湖边的粉色小屋',
    requiredDays: 0,
    artFile: 'scene-mia.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'meadow',
    slot: 'focus',
    name: '青草坡屋',
    hint: '雨后的草坡和白栅栏',
    requiredDays: 0,
    artFile: 'stats-rhythm-house-v1.webp',
    focusArtPosition: 'center 64%',
  },
  {
    id: 'beijing',
    slot: 'focus',
    name: '北京',
    hint: '晨光里的祈年殿',
    requiredDays: 7,
    artFile: 'scene-beijing.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'harbin',
    slot: 'focus',
    name: '哈尔滨',
    hint: '雪后的索菲亚教堂',
    requiredDays: 14,
    artFile: 'scene-harbin.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'shanghai',
    slot: 'focus',
    name: '上海',
    hint: '春天的外滩和东方明珠',
    requiredDays: 21,
    artFile: 'scene-shanghai.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'xian',
    slot: 'focus',
    name: '西安',
    hint: '城墙上的钟鼓楼',
    requiredDays: 28,
    artFile: 'scene-xian.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'changbaishan',
    slot: 'focus',
    name: '长白山',
    hint: '雪线之上的天池',
    requiredDays: 35,
    artFile: 'scene-changbaishan.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'maldives',
    slot: 'focus',
    name: '马尔代夫',
    hint: '海面上的水屋',
    requiredDays: 42,
    artFile: 'scene-maldives.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'dubai',
    slot: 'focus',
    name: '迪拜',
    hint: '海边的帆船塔',
    requiredDays: 49,
    artFile: 'scene-dubai.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'melbourne',
    slot: 'focus',
    name: '墨尔本',
    hint: '河边的城市天际线',
    requiredDays: 56,
    artFile: 'scene-melbourne.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'cairns',
    slot: 'focus',
    name: '凯恩斯',
    hint: '珊瑚礁边的海湾小城',
    requiredDays: 63,
    artFile: 'scene-cairns.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'sydney',
    slot: 'focus',
    name: '悉尼',
    hint: '黄昏港湾的歌剧院',
    requiredDays: 70,
    artFile: 'scene-sydney.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'abudhabi',
    slot: 'focus',
    name: '阿布扎比',
    hint: '海边的白色清真寺',
    requiredDays: 77,
    artFile: 'scene-abudhabi.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'weihai',
    slot: 'focus',
    name: '威海',
    hint: '海湾边的灯塔与栈道',
    requiredDays: 84,
    artFile: 'scene-weihai.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'bangkok',
    slot: 'focus',
    name: '曼谷',
    hint: '金顶大皇宫',
    requiredDays: 91,
    artFile: 'scene-bangkok.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'dunhuang',
    slot: 'focus',
    name: '敦煌',
    hint: '沙丘旁的莫高窟',
    requiredDays: 98,
    artFile: 'scene-dunhuang.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'phuket',
    slot: 'focus',
    name: '普吉岛',
    hint: '长尾船停在海湾里',
    requiredDays: 105,
    artFile: 'scene-phuket.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'bali',
    slot: 'focus',
    name: '巴厘岛',
    hint: '海崖上的塔庙',
    requiredDays: 112,
    artFile: 'scene-bali.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'macau',
    slot: 'focus',
    name: '澳门',
    hint: '大三巴牌坊前的石阶',
    requiredDays: 119,
    artFile: 'scene-macau.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'zhuhai',
    slot: 'focus',
    name: '珠海',
    hint: '海边的日月贝',
    requiredDays: 126,
    artFile: 'scene-zhuhai.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'sanya',
    slot: 'focus',
    name: '三亚',
    hint: '海上的观音像',
    requiredDays: 133,
    artFile: 'scene-sanya.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'hokkaido',
    slot: 'focus',
    name: '北海道',
    hint: '花田尽头的风车',
    requiredDays: 140,
    artFile: 'scene-hokkaido.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'cambodia',
    slot: 'focus',
    name: '柬埔寨',
    hint: '水边的吴哥窟',
    requiredDays: 147,
    artFile: 'scene-cambodia.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'yangzhou',
    slot: 'focus',
    name: '扬州',
    hint: '烟花三月的五亭桥',
    requiredDays: 154,
    artFile: 'scene-yangzhou.webp',
    hasBuiltInMargin: true,
  },
  {
    id: 'xishuangbanna',
    slot: 'focus',
    name: '西双版纳',
    hint: '江边的金顶佛寺',
    requiredDays: 161,
    artFile: 'scene-xishuangbanna.webp',
    hasBuiltInMargin: true,
  },
];

/** Art the 每日伙伴 item shows, which is whatever the current profile wears. */
const PROFILE_MASCOT_ART: Record<ProfileId, string> = {
  'cute-junjun': 'review-junjun-cutout-v1.webp',
  'stinky-dog': 'review-dog-scene-v1.webp',
  'fragrant-rabbit': 'review-bunny-scene.png',
};

/** Enough check-in days to own everything, derived so new art is covered too. */
export const DEBUG_UNLOCK_DAYS = BACKPACK_ITEMS
  .reduce((most, item) => Math.max(most, item.requiredDays), 0);

/**
 * The day count the backpack should reason with.
 *
 * Ownership is only ever a question of how many days have been checked in, so
 * the debug profile does not need a parallel notion of "owned" — it needs the
 * clock wound forward. New art has to be looked at on a real page before it is
 * worth shipping, and sixty days of check-ins is not a review loop.
 */
export function resolveBackpackDays(totalCheckInDays: number, unlockAll: boolean): number {
  return unlockAll ? Math.max(totalCheckInDays, DEBUG_UNLOCK_DAYS) : totalCheckInDays;
}

export function listSlotItems(slot: BackpackSlot): BackpackItem[] {
  return BACKPACK_ITEMS.filter((item) => item.slot === slot);
}

export function listRewardItems(): BackpackItem[] {
  return BACKPACK_ITEMS
    .filter((item) => item.requiredDays > 0)
    .sort((left, right) => left.requiredDays - right.requiredDays);
}

export function getUpcomingRewards(totalCheckInDays: number, limit?: number): BackpackItem[] {
  const upcoming = listRewardItems()
    .filter((item) => item.requiredDays > totalCheckInDays);
  return limit === undefined ? upcoming : upcoming.slice(0, Math.max(0, limit));
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
  const locked = listRewardItems().filter((item) => !isItemOwned(item, totalCheckInDays));
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
 * The whole background shorthand for an equipped focus scene, or null when
 * there is no picture to paint.
 *
 * The free scene used to be excluded here and painted by a stylesheet rule of
 * its own, which meant swapping it took an edit in two places -- so it is
 * driven from the catalogue like every other scene now.
 *
 * Driving this from the catalogue rather than a rule per item is what makes
 * adding a scene a one-line change: a hand-written stylesheet rule that nobody
 * remembers to add is a scene that silently keeps the old picture.
 */
export function getFocusSceneBackground(item: BackpackItem, profileId: ProfileId): string | null {
  if (item.slot !== 'focus' || !item.artFile) return null;
  const layers = [
    ...(item.hasBuiltInMargin ? [] : [FOCUS_SCRIM]),
    `url('${getItemArtUrl(item, profileId)}') ${item.focusArtPosition ?? 'center 58%'} / cover no-repeat`,
  ];
  return layers.join(', ');
}
