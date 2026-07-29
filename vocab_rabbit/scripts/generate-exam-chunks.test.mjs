import { describe, expect, it } from 'vitest';
import { buildTasks, packTasks, validateTaskResult } from './generate-exam-chunks.mjs';

const options = {
  maxCandidatesPerTask: 2,
  maxTasksPerRequest: 2,
  maxCandidatesPerRequest: 3,
};

describe('exam chunk generation pipeline', () => {
  it('splits large source candidate sets without losing candidates', () => {
    const words = [{
      id: 'ket_after_adv_prep',
      english: 'after',
      partOfSpeech: 'adv & prep',
      chinese: '在……之后',
      category: '时间',
    }];
    const sourceEntries = new Map([['ket_after_adv_prep', {
      candidates: [
        { phrase: 'after all', evidence: [] },
        { phrase: 'look after', evidence: [] },
        { phrase: 'the day after', evidence: [] },
      ],
    }]]);
    const tasks = buildTasks(words, sourceEntries, options);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ allowAdditional: true });
    expect(tasks[1]).toMatchObject({ allowAdditional: false });
    expect(tasks.flatMap((task) => task.sourceCandidates)).toHaveLength(3);
  });

  it('packs tasks within request limits', () => {
    const tasks = [
      { sourceCandidates: [{}, {}] },
      { sourceCandidates: [{}, {}] },
      { sourceCandidates: [] },
    ];
    expect(packTasks(tasks, options).map((batch) => batch.length)).toEqual([1, 2]);
  });

  it('accepts real exam chunks and rejects arbitrary or malformed output', () => {
    const task = {
      taskId: 'ket_after_adv_prep#0',
      headwordVariants: ['after'],
    };
    expect(validateTaskResult(task, {
      taskId: task.taskId,
      chunks: [{
        phrase: 'look after',
        chinese: '照顾',
        sense: 'take care of somebody or something',
        type: 'phrasal_verb',
        cefr: 'A2',
      }],
    })).toMatchObject({ valid: true });
    expect(validateTaskResult(task, {
      taskId: task.taskId,
      chunks: [{
        phrase: 'take care of',
        chinese: '照顾',
        sense: 'care for somebody',
        type: 'fixed_expression',
        cefr: 'A2',
      }],
    })).toMatchObject({ valid: false });
  });
});
