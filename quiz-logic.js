export function scoreAnswers(answers, answerKey) {
  if (answers.length !== answerKey.length) throw new Error('Answer list must match the answer key.');
  return answers.reduce((score, answer, index) => score + (answer !== null && answer === answerKey[index] ? 10 : 0), 0);
}

export function rankEntries(entries) {
  return [...entries].sort((first, second) => second.score - first.score || first.durationMs - second.durationMs || first.createdAt - second.createdAt);
}

export function topEntries(entries, limit = 10) {
  return rankEntries(entries).slice(0, limit);
}
