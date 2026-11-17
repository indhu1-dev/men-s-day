import { questions } from './questions.js';
import { scoreAnswer, summarize, rankEntries, rankOf } from './quiz-logic.js';

const SCORE_KEY = 'mens-day-fastest-finger-scores-v1';
const byId = id => document.getElementById(id);
let activeView = 'home';
let questionIndex = 0;
let answers = [];
let participant = '';
let quizStartedAt = 0;
let timerInterval = null;
let transitioning = false;

function icon(name, className = '') {
  return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''} aria-hidden="true"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function getScores() {
  try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '[]'); }
  catch { return []; }
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `${view}-view`));
  document.querySelectorAll('.nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'leaderboard') renderLeaderboard();
  if (view === 'flyer') renderFlyer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
}

function showWelcome() {
  byId('quiz-shell').innerHTML = `<div class="welcome-state"><div class="welcome-icon">${icon('timer')}</div><h3>Make every second count.</h3><p>Enter your name, then take on ten questions across sport, science, health and a little office humor.</p><form id="participant-form"><label for="participant-name">Your name</label><div class="name-entry"><input id="participant-name" name="name" maxlength="24" autocomplete="name" placeholder="First name or nickname" required><button class="button button-dark" type="submit">Let's go ${icon('arrow-right')}</button></div></form><p class="privacy-note">${icon('lock-keyhole')} Scores are saved on this device.</p></div>`;
  refreshIcons();
}

function beginQuiz(name) {
  participant = name.trim().slice(0, 24);
  questionIndex = 0;
  answers = [];
  transitioning = false;
  quizStartedAt = performance.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateElapsedTime, 100);
  renderQuestion();
}

function renderQuestion() {
  transitioning = false;
  const question = questions[questionIndex];
  const shell = byId('quiz-shell');
  shell.innerHTML = `<div class="question-state"><div class="question-meta"><span class="category-pill">${question.category}</span><span class="question-count">QUESTION <b>${String(questionIndex + 1).padStart(2, '0')}</b> / ${String(questions.length).padStart(2, '0')}</span></div><div class="progress-track"><span style="width:${(questionIndex / questions.length) * 100}%"></span></div><div class="question-layout"><div class="question-copy"><h3>${question.question}</h3><div class="answer-list" role="group" aria-label="Answer options">${question.options.map((option, index) => `<button class="answer-option" data-choice="${index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${option}</span><span class="option-result"></span></button>`).join('')}</div></div><aside class="timer-block"><div class="timer-caption">TOTAL TIME</div><div class="timer-number" id="timer-number">0:00</div><div class="timer-unit">ELAPSED</div></aside></div><div class="question-bottom"><span>${icon('zap')} Quick answers lead the way</span><span>+10 POINTS FOR CORRECT ANSWERS</span></div></div>`;
  shell.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => answerQuestion(Number(button.dataset.choice))));
  refreshIcons();
  updateElapsedTime();
}

function updateElapsedTime() {
  const number = byId('timer-number');
  if (!number) return;
  number.textContent = formatClock(performance.now() - quizStartedAt);
}

function answerQuestion(choice) {
  if (transitioning) return;
  transitioning = true;
  const result = scoreAnswer(questions[questionIndex], choice);
  answers.push(result);
  document.querySelectorAll('.answer-option').forEach((button, index) => {
    button.disabled = true;
    if (index === questions[questionIndex].answer) button.classList.add('correct');
    else if (index === choice) button.classList.add('incorrect');
  });
  const message = document.createElement('p');
  message.className = `answer-feedback ${result.correct ? 'is-correct' : 'is-missed'}`;
  message.innerHTML = `${icon(result.correct ? 'check-circle-2' : 'info')} ${result.correct ? 'Correct! +10 points.' : 'Not quite. No points this time.'} <span>${questions[questionIndex].explanation}</span>`;
  byId('quiz-shell').querySelector('.question-copy').append(message);
  refreshIcons();
  window.setTimeout(() => {
    questionIndex += 1;
    if (questionIndex < questions.length) renderQuestion();
    else finishQuiz();
  }, 1150);
}

function finishQuiz() {
  clearInterval(timerInterval);
  const result = summarize(answers, performance.now() - quizStartedAt);
  const entry = { name: participant, ...result, createdAt: Date.now() };
  const scores = rankEntries([...getScores(), entry]).slice(0, 100);
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(scores)); }
  catch { /* Scores remain visible for this result even if storage is unavailable. */ }
  const rank = rankOf(entry, scores);
  const placeMessage = rank === 1 ? 'You set the pace. First place!' : rank <= 3 ? `A podium finish. You're in the top ${rank}.` : `You finished ${ordinal(rank)} on this device. Keep that pace.`;
  byId('quiz-shell').innerHTML = `<div class="result-state"><div class="result-medal">${icon(rank === 1 ? 'trophy' : 'award')}</div><span class="eyebrow">CHALLENGE COMPLETE</span><h3>${escapeHTML(participant)}, well played.</h3><p class="result-message">${placeMessage}</p><div class="result-stats"><div><strong>${result.score}<small>/100</small></strong><span>POINTS</span></div><div><strong>${result.correct}<small>/10</small></strong><span>CORRECT</span></div><div><strong>${formatTime(result.durationMs)}</strong><span>TOTAL TIME</span></div></div><div class="result-actions"><button class="button button-blue" id="play-again">Play again ${icon('rotate-ccw')}</button><button class="button button-outline" id="see-results">Leaderboard ${icon('trophy')}</button></div><p class="privacy-note">${icon('lock-keyhole')} Your score is saved on this device only.</p></div>`;
  byId('play-again').addEventListener('click', showWelcome);
  byId('see-results').addEventListener('click', () => setView('leaderboard'));
  refreshIcons();
}

function ordinal(value) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th');
  return `${value}${suffix}`;
}

function formatTime(milliseconds) {
  const seconds = (milliseconds / 1000).toFixed(1);
  return `${seconds}s`;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderLeaderboard() {
  const scores = rankEntries(getScores()).slice(0, 20);
  const tbody = byId('leaderboard-body');
  const empty = byId('empty-board');
  tbody.replaceChildren();
  empty.hidden = scores.length > 0;
  for (const [index, entry] of scores.entries()) {
    const row = document.createElement('tr');
    row.innerHTML = `<td><span class="rank-number ${index < 3 ? `rank-${index + 1}` : ''}">${String(index + 1).padStart(2, '0')}</span></td><td><strong>${escapeHTML(entry.name)}</strong></td><td><span class="score-cell">${entry.score}<small> pts</small></span></td><td>${formatTime(entry.durationMs)}</td><td>${new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>`;
    tbody.append(row);
  }
  refreshIcons();
}

function renderFlyer() {
  const url = window.location.href.split(/[?#]/)[0];
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:';
  byId('quiz-url').textContent = isLocal ? 'Publish to create your quiz link' : url;
  byId('quiz-url').href = isLocal ? '#home' : url;
  const image = byId('qr-image');
  const placeholder = byId('qr-placeholder');
  if (isLocal) {
    image.hidden = true;
    placeholder.hidden = false;
  } else {
    image.src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
    image.hidden = false;
    placeholder.hidden = true;
  }
}

function printFlyer() {
  window.print();
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-view]');
  if (target) {
    event.preventDefault();
    setView(target.dataset.view);
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'participant-form') return;
  event.preventDefault();
  const name = byId('participant-name').value.trim();
  if (name) beginQuiz(name);
});

byId('start-button').addEventListener('click', () => {
  byId('participant-name').focus();
  byId('quiz-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
byId('clear-scores').addEventListener('click', () => {
  if (getScores().length && window.confirm('Clear every score saved in this browser?')) {
    localStorage.removeItem(SCORE_KEY);
    renderLeaderboard();
  }
});
byId('print-flyer').addEventListener('click', printFlyer);

renderLeaderboard();
showWelcome();
renderFlyer();
refreshIcons();
