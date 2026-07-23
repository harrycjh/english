import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WordPayload } from '../src/models/word';

const payload = JSON.parse(
  readFileSync(
    new URL('../public/content/words/ket_vocabulary.json', import.meta.url),
    'utf8',
  ),
) as WordPayload;

describe('polysemous vocabulary content', () => {
  it('keeps can aligned to the modal-verb study sense', () => {
    const can = payload.words.find((word) => word.id === 'ket_can_n_mv');

    expect(can).toBeDefined();
    expect(can?.category).toBe('情态动词和语气');
    expect(can?.studySense).toEqual({
      partOfSpeech: 'mv',
      chinese: '能；会',
      examples: ['The boy can ride a bike.'],
    });
    expect(can?.examples).not.toContain('Can you open the can of beans?');
  });

  it('locks audited words to one image-aligned study sense', () => {
    const expected = {
      ket_back_n_adv_adj: ['n', '背部', 'My back hurts after exercise.'],
      ket_break_n_v: ['v', '骨折；弄断', 'He broke his arm when he fell.'],
      ket_hard_adj_adv: ['adj', '困难的', 'This puzzle is hard, but I will keep trying.'],
      ket_right_n_adj_adv: ['adj', '正确的', 'Your answer is right.'],
      ket_show_v_n: ['n', '表演', 'We watched a magic show at school.'],
      ket_film_n_v: ['v', '拍摄', 'They filmed a scene in the park.'],
      ket_text_n_v: ['n', '文字；文本', 'The text is easy to read.'],
      ket_half_det_n_pron: ['det', '一半', 'She ate half of the apple.'],
      ket_second_adj_det_n: ['n', '第二名', 'She finished the race in second place.'],
      ket_return_n_v: ['v', '返回', 'We returned home after school.'],
      ket_above_adv_prep: ['prep', '在……上方', 'The ball is above the box.'],
      ket_around_adv_prep: ['prep', '围绕；在……周围', 'The children sat around the table.'],
      ket_as_conj_adv_prep: ['prep', '作为', 'She works as a doctor.'],
      ket_brush_n_v: ['v', '刷', 'Please brush your teeth before bed.'],
      ket_cover_v_n: ['v', '覆盖；盖住', 'She covered the child with a blanket.'],
      ket_cross_n_v: ['v', '穿过；横过', 'We crossed the road at the crossing.'],
      ket_tidy_adj_v: ['v', '整理；收拾', 'We must tidy up the room.'],
      ket_home_n_adv: ['n', '家；住所', 'This is our family home.'],
      ket_light_n_adj: ['n', '灯光；光线', 'The room is full of warm light.'],
      ket_matter_n_v: ['v', '重要；要紧', 'Your feelings matter to me.'],
    } as const;

    for (const [wordId, [partOfSpeech, chinese, example]] of Object.entries(expected)) {
      const word = payload.words.find((candidate) => candidate.id === wordId);

      expect(word, wordId).toBeDefined();
      expect(word?.studySense, wordId).toEqual({
        partOfSpeech,
        chinese,
        examples: [example],
      });
      expect(word?.examples, wordId).toEqual([example]);
    }
  });

  it('moves quantity, order, and straight to categories matching their selected senses', () => {
    const categories = Object.fromEntries(
      payload.words.map((word) => [word.id, word.category]),
    );

    expect(categories.ket_half_det_n_pron).toBe('数量和多少');
    expect(categories.ket_second_adj_det_n).toBe('数字和顺序词');
    expect(categories.ket_straight_adj_adv).toBe('常见形容词');
  });
});
