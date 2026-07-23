import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(
  projectRoot,
  'public/content/words/ket_vocabulary.json',
);

const fixes = {
  ket_love_n_v: ['v', '喜爱；热爱', 'I love playing with my dog.'],
  ket_back_n_adv_adj: ['n', '背部', 'My back hurts after exercise.'],
  ket_break_n_v: ['v', '骨折；弄断', 'He broke his arm when he fell.'],
  ket_fall_n_v: ['v', '摔倒；落下', 'The child fell onto the soft mat.'],
  ket_clean_adj_v: ['v', '清洁；洗净', 'I need to clean my hands before eating.'],
  ket_cold_adj_n: ['n', '感冒', 'I have a cold and need to rest at home.'],
  ket_well_adv_adj: ['adj', '身体好的；健康的', 'I feel well today and can go to school.'],
  ket_sweet_n_adj: ['n', '糖果', 'She gave me a sweet to eat.'],
  ket_hard_adj_adv: ['adj', '困难的', 'This puzzle is hard, but I will keep trying.'],
  ket_right_n_adj_adv: ['adj', '正确的', 'Your answer is right.'],
  ket_cool_adj_exclam: ['exclam', '酷；太棒了', "That's so cool! I want one too."],
  ket_kind_adj_n: ['adj', '善良的；友好的', 'He is a kind man, so he helps others.'],
  ket_home_n_adv: ['n', '家；住所', 'This is our family home.'],
  ket_light_n_adj: ['n', '灯光；光线', 'The room is full of warm light.'],
  ket_ring_n_v: ['n', '戒指', 'I wear a ring on my finger.'],
  ket_orange_adj_n: ['adj', '橙色的', 'The bus is orange.'],
  ket_cook_n_v: ['n', '厨师', 'She is a cook.'],
  ket_drink_n_v: ['n', '饮料', 'I need a drink.'],
  ket_glass_n_adj: ['n', '玻璃杯', 'We have a glass of water.'],
  ket_book_n_v: ['n', '书', 'I need to buy a new book for my class.'],
  ket_message_n_v: ['n', '消息；信息', 'I left a message for my mother.'],
  ket_text_n_v: ['n', '文字；文本', 'The text is easy to read.'],
  ket_film_n_v: ['v', '拍摄', 'They filmed a scene in the park.'],
  ket_show_v_n: ['n', '表演', 'We watched a magic show at school.'],
  ket_fun_adj_n: ['adj', '有趣的；令人愉快的', 'The party was fun for everyone.'],
  ket_dance_n_v: ['v', '跳舞', 'She likes to dance at parties.'],
  ket_park_n_v: ['n', '公园', 'We went to the park and played.'],
  ket_race_n_v: ['n', '赛跑；比赛', 'My brother won the race yesterday.'],
  ket_underground_n_adj: ['n', '地铁', 'The underground station was crowded.'],
  ket_square_n_adj: ['n', '广场', 'They played in the square.'],
  ket_change_v_n: ['n', '零钱', 'I gave her some change for the coffee.'],
  ket_snow_n_v: ['n', '雪', 'Snow covered the ground.'],
  ket_half_det_n_pron: ['det', '一半', 'She ate half of the apple.'],
  ket_second_adj_det_n: ['n', '第二名', 'She finished the race in second place.'],
  ket_daily_adj_adv: ['adv', '每天', 'The newspaper is published daily.'],
  ket_return_n_v: ['v', '返回', 'We returned home after school.'],
  ket_another_det_pron: ['det', '另一个', 'Can I have another cookie?'],
  ket_whose_det_pron: ['det', '谁的', 'Whose book is this?'],
  ket_above_adv_prep: ['prep', '在……上方', 'The ball is above the box.'],
  ket_around_adv_prep: ['prep', '围绕；在……周围', 'The children sat around the table.'],
  ket_as_conj_adv_prep: ['prep', '作为', 'She works as a doctor.'],
  ket_early_adj_adv: ['adv', '早；提前', 'She arrived at the meeting early.'],
  ket_straight_adj_adv: ['adj', '直的', 'This road is straight.'],
  ket_answer_n_v: ['v', '回答', "She answered the teacher's question."],
  ket_brush_n_v: ['v', '刷', 'Please brush your teeth before bed.'],
  ket_contact_n_v: ['v', '联系', 'I need to contact my friend.'],
  ket_cover_v_n: ['v', '覆盖；盖住', 'She covered the child with a blanket.'],
  ket_cross_n_v: ['v', '穿过；横过', 'We crossed the road at the crossing.'],
  ket_matter_n_v: ['v', '重要；要紧', 'Your feelings matter to me.'],
  ket_order_n_v: ['v', '点餐；订购', 'I want to order a pizza.'],
  ket_post_v_n: ['v', '邮寄', 'Please post this letter on your way home.'],
  ket_tidy_adj_v: ['v', '整理；收拾', 'We must tidy up the room.'],
  ket_total_adj_n: ['adj', '总的', 'The total amount was one hundred coins.'],
  ket_whole_adj_n: ['adj', '整个的', 'I ate the whole apple.'],
};

const categoryFixes = {
  ket_half_det_n_pron: '数量和多少',
  ket_second_adj_det_n: '数字和顺序词',
  ket_straight_adj_adv: '常见形容词',
};

const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
const wordsById = new Map(payload.words.map((word) => [word.id, word]));

for (const [wordId, [partOfSpeech, chinese, example]] of Object.entries(fixes)) {
  const word = wordsById.get(wordId);
  if (!word) {
    throw new Error(`Unknown word id: ${wordId}`);
  }

  word.studySense = {
    partOfSpeech,
    chinese,
    examples: [example],
  };
  word.examples = [example];

  if (categoryFixes[wordId]) {
    word.category = categoryFixes[wordId];
  }
}

await fs.writeFile(
  vocabularyPath,
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8',
);

console.log(`Updated ${Object.keys(fixes).length} study senses.`);
