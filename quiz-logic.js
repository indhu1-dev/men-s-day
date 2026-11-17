export function scoreAnswer(question, choice) {
  const correct = choice !== null && choice === question.answer;
  return { choice, correct, points: correct ? 10 : 0 };
}

export function summarize(answers, durationMs) {
  return {
    score: answers.reduce((total, answer) => total + answer.points, 0),
    correct: answers.filter(answer => answer.correct).length,
    durationMs
  };
}

export function rankEntries(entries) {
  return [...entries].sort((first, second) => second.score - first.score || first.durationMs - second.durationMs || first.createdAt - second.createdAt);
}

export function rankOf(entry, entries) {
  return 1 + entries.filter(other => other.score > entry.score || (other.score === entry.score && other.durationMs < entry.durationMs)).length;
}
