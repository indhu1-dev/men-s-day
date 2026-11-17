import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswers, rankEntries, topEntries } from '../quiz-logic.js';
import { questions } from '../questions.js';

const answerKey = [2, 3, 2, 2, 1, 1, 2, 2, 2, 3];

test('all supplied questions have four options and no public answer key', () => {
  assert.equal(questions.length, 10);
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.equal('answer' in question, false);
    assert.equal('explanation' in question, false);
  }
  assert.equal(answerKey.length, questions.length);
});

test('correct answers earn 10, incorrect and unanswered choices earn zero', () => {
  assert.equal(scoreAnswers([2, 0, null], [2, 1, 3]), 10);
  assert.equal(scoreAnswers([2, 1, 3], [2, 1, 3]), 30);
  assert.throws(() => scoreAnswers([2], [2, 3]), /match the answer key/);
});

test('higher scores rank first and faster total time breaks ties', () => {
  const slower = { score: 90, durationMs: 20000, createdAt: 1 };
  const faster = { score: 90, durationMs: 10000, createdAt: 2 };
  const lower = { score: 80, durationMs: 1000, createdAt: 3 };
  assert.deepEqual(rankEntries([lower, slower, faster]), [faster, slower, lower]);
});

test('shared leaderboard is limited to the top ten', () => {
  const entries = Array.from({ length: 20 }, (_, index) => ({ score: 100 - index, durationMs: index * 1000, createdAt: index }));
  assert.equal(topEntries(entries).length, 10);
  assert.equal(topEntries(entries)[0].score, 100);
});
