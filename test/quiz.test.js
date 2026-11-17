import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer, summarize, rankEntries, rankOf } from '../quiz-logic.js';
import { questions } from '../questions.js';

test('all supplied questions have four options and a valid answer', () => {
  assert.equal(questions.length, 10);
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4);
  }
  assert.equal(questions[1].answer, 3);
});

test('correct answers earn 10 and incorrect answers earn zero without a per-question time limit', () => {
  assert.equal(scoreAnswer(questions[0], 2).points, 10);
  assert.equal(scoreAnswer(questions[0], 0).points, 0);
  assert.equal(scoreAnswer(questions[0], null).points, 0);
});

test('summary aggregates points and response times', () => {
  assert.deepEqual(summarize([scoreAnswer(questions[0], 2), scoreAnswer(questions[1], null)], 15000), { score: 10, correct: 1, durationMs: 15000 });
});

test('score ranks first, faster time breaks ties, exact ties share rank', () => {
  const slower = { score: 90, durationMs: 20000, createdAt: 1 };
  const faster = { score: 90, durationMs: 10000, createdAt: 2 };
  const lower = { score: 80, durationMs: 1000, createdAt: 3 };
  assert.deepEqual(rankEntries([lower, slower, faster]), [faster, slower, lower]);
  assert.equal(rankOf(slower, [slower, faster, lower]), 2);
  assert.equal(rankOf({ ...faster }, [slower, faster, lower]), 1);
});
