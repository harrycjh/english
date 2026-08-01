import { describe, expect, it } from 'vitest';
import {
  attachEvidence,
  buildTasks,
  indexResponseEntries,
  packTasks,
  validateTaskResult,
} from './generate-exam-chunks.mjs';

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
    const malformed = {
      taskId: task.taskId,
      chunks: [{
        phrase: 'take care of',
        chinese: '照顾',
        sense: 'care for somebody',
        type: 'fixed_expression',
        cefr: 'A2',
      }],
    };
    expect(validateTaskResult(task, malformed)).toMatchObject({ valid: false, chunks: [] });
    expect(validateTaskResult(task, malformed, true)).toMatchObject({ valid: true, chunks: [] });
  });

  it('recovers a copied task id only when one task and one result are unambiguous', () => {
    const task = { taskId: 'ket_can_n_mv#1' };
    const result = { taskId: 'ket_can_n_mv#0', chunks: [] };
    expect(indexResponseEntries([task], [result]).get(task.taskId)).toEqual({
      taskId: task.taskId,
      chunks: [],
    });
    expect(indexResponseEntries([task, { taskId: 'other#0' }], [result]).has(task.taskId)).toBe(false);
  });

  it('treats an omitted single-task result as an explicit empty result', () => {
    const secondary = { taskId: 'ket_can_n_mv#1', allowAdditional: false };
    expect(indexResponseEntries([secondary], []).get(secondary.taskId)).toEqual({
      taskId: secondary.taskId,
      chunks: [],
    });
    const primary = { taskId: 'ket_can_n_mv#0', allowAdditional: true };
    expect(indexResponseEntries([primary], []).get(primary.taskId)).toEqual({
      taskId: primary.taskId,
      chunks: [],
    });
  });

  it('forwards every cleaned source candidate to the recall review', () => {
    const words = [{ id: 'ket_after_adv_prep', english: 'after' }];
    const sources = new Map([['ket_after_adv_prep', {
      candidates: [{
        phrase: 'look after',
        evidence: [{ source: 'phave' }, { source: 'wiktionary-kaikki' }],
      }],
    }]]);
    expect(attachEvidence(words, sources, new Map())).toEqual([{
      id: 'ket_after_adv_prep',
      english: 'after',
      chunks: [{
        phrase: 'look after',
        sources: ['phave', 'wiktionary-kaikki'],
      }],
    }]);
  });
});
