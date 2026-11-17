import { questions } from './questions.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const byId = id => document.getElementById(id);
let activeView = 'home';
let questionIndex = 0;
let answers = [];
let participantUpsId = '';
let participantName = '';
let attemptToken = '';
let quizStartedAt = 0;
let timerInterval = null;

function icon(name, className = '') {
  return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''} aria-hidden="true"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function backendConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function requestResults(path, options = {}) {
  if (!backendConfigured()) throw new Error('Shared results are not configured yet. Add the Supabase project URL and public anon key to config.js.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/quiz-results${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Results service returned ${response.status}.`);
  return data;
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
  clearInterval(timerInterval);
  participantUpsId = '';
  byId('quiz-shell').innerHTML = `<div class="welcome-state"><div class="welcome-icon">${icon('badge-check')}</div><h3>Join the challenge.</h3><p>Enter your name and UPS ID. Your ID is used once for the official result and masked on the public leaderboard.</p><form id="participant-form"><div class="participant-fields"><div><label for="participant-name">Your name</label><input id="participant-name" name="name" maxlength="50" autocomplete="name" placeholder="Enter your name" required></div><div><label for="participant-ups-id">UPS ID</label><input id="participant-ups-id" name="upsId" maxlength="64" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="Enter your UPS ID" required></div></div><button class="button button-dark" type="submit">Continue ${icon('arrow-right')}</button></form><p class="privacy-note">${icon('lock-keyhole')} Your timer starts only after you press Start Quiz.</p></div>`;
  refreshIcons();
}

function showReady(errorMessage = '') {
  byId('quiz-shell').innerHTML = `<div class="welcome-state ready-state"><div class="welcome-icon">${icon(errorMessage ? 'triangle-alert' : 'circle-check')}</div><span class="eyebrow">PARTICIPANT READY</span><h3>${errorMessage ? 'Could not start yet.' : `Ready, ${escapeHTML(participantName)}?`}</h3><p>${errorMessage ? escapeHTML(errorMessage) : `UPS ID ${escapeHTML(maskUpsId(participantUpsId))} is ready. The overall clock starts only when you press Start Quiz.`}</p><div class="ready-actions"><button class="button button-blue" id="begin-quiz">${icon('play')} Start Quiz</button><button class="button button-outline" id="edit-ups-id">Edit details</button></div></div>`;
  byId('begin-quiz').addEventListener('click', () => beginQuiz());
  byId('edit-ups-id').addEventListener('click', showWelcome);
  refreshIcons();
}

async function beginQuiz() {
  const startButton = byId('begin-quiz');
  startButton.disabled = true;
  startButton.textContent = 'Starting…';
  let startedAt;
  try {
    const started = await requestResults('', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', upsId: participantUpsId, name: participantName })
    });
    attemptToken = started.attemptToken;
    startedAt = started.startedAt;
  } catch (error) {
    showReady(error.message);
    return;
  }
  questionIndex = 0;
  answers = Array(questions.length).fill(null);
  quizStartedAt = performance.now() - Math.max(0, Date.now() - Date.parse(startedAt));
  clearInterval(timerInterval);
  timerInterval = setInterval(updateElapsedTime, 100);
  renderQuestion();
}

function renderQuestion() {
  const question = questions[questionIndex];
  const shell = byId('quiz-shell');
  shell.innerHTML = `<div class="question-state"><div class="question-meta"><span class="category-pill">${question.category}</span><span class="question-count">QUESTION <b>${String(questionIndex + 1).padStart(2, '0')}</b> / ${String(questions.length).padStart(2, '0')}</span></div><div class="progress-track"><span style="width:${((questionIndex + 1) / questions.length) * 100}%"></span></div><div class="question-layout"><div class="question-copy"><h3>${question.question}</h3><div class="answer-list" role="group" aria-label="Answer options">${question.options.map((option, index) => `<button class="answer-option${answers[questionIndex] === index ? ' selected' : ''}" data-choice="${index}" aria-pressed="${answers[questionIndex] === index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${option}</span><span class="option-result"></span></button>`).join('')}</div></div><aside class="timer-block"><div class="timer-caption">TOTAL TIME</div><div class="timer-number" id="timer-number">0:00</div><div class="timer-unit">ELAPSED</div></aside></div><div class="question-navigation"><button class="button button-outline" id="previous-question"${questionIndex === 0 ? ' disabled' : ''}>${icon('arrow-left')} Prev</button><span class="answer-progress">${answers.filter(answer => answer !== null).length} / ${questions.length} answered</span><div class="question-nav-actions"><button class="button button-outline" id="next-question"${questionIndex === questions.length - 1 ? ' disabled' : ''}>Next ${icon('arrow-right')}</button><button class="button button-blue" id="submit-quiz">Submit ${icon('check')}</button></div></div><div class="question-bottom"><span>${icon('zap')} You can change answers before submitting.</span><span>+10 POINTS FOR CORRECT ANSWERS</span></div></div>`;
  shell.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => selectAnswer(Number(button.dataset.choice))));
  byId('previous-question').addEventListener('click', () => navigateQuestion(-1));
  byId('next-question').addEventListener('click', () => navigateQuestion(1));
  byId('submit-quiz').addEventListener('click', submitQuiz);
  refreshIcons();
  updateElapsedTime();
}

function updateElapsedTime() {
  const number = byId('timer-number');
  if (!number) return;
  number.textContent = formatClock(performance.now() - quizStartedAt);
}

function selectAnswer(choice) {
  answers[questionIndex] = choice;
  document.querySelectorAll('.answer-option').forEach((button, index) => {
    const selected = index === choice;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  byId('quiz-shell').querySelector('.answer-progress').textContent = `${answers.filter(answer => answer !== null).length} / ${questions.length} answered`;
}

function navigateQuestion(direction) {
  const nextIndex = questionIndex + direction;
  if (nextIndex < 0 || nextIndex >= questions.length) return;
  questionIndex = nextIndex;
  renderQuestion();
}

function submitQuiz() {
  const unanswered = answers.filter(answer => answer === null).length;
  if (unanswered && !window.confirm(`You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway? Unanswered questions score zero.`)) return;
  finishQuiz();
}

async function finishQuiz() {
  clearInterval(timerInterval);
  showSubmissionState('Submitting your result…');
  try {
    const result = await requestResults('', {
      method: 'POST',
      body: JSON.stringify({ action: 'submit', upsId: participantUpsId, attemptToken, answers })
    });
    renderResult(result);
  } catch (error) {
    showSubmissionState(error.message, true);
  }
}

function showSubmissionState(message, canRetry = false) {
  byId('quiz-shell').innerHTML = `<div class="welcome-state"><div class="welcome-icon">${icon(canRetry ? 'triangle-alert' : 'loader-circle')}</div><h3>${canRetry ? 'Result not submitted.' : 'Recording your result…'}</h3><p>${escapeHTML(message)}</p>${canRetry ? `<button class="button button-blue" id="retry-submit">Retry submission ${icon('refresh-cw')}</button>` : ''}</div>`;
  if (canRetry) byId('retry-submit').addEventListener('click', finishQuiz);
  refreshIcons();
}

function renderResult(result) {
  const topTenMessage = result.rank <= 10 ? `You’re in the top ten at rank ${result.rank}.` : `Your current rank is ${result.rank} of ${result.totalParticipants}. Keep an eye on the leaderboard.`;
  byId('quiz-shell').innerHTML = `<div class="result-state"><div class="result-medal">${icon(result.rank <= 10 ? 'trophy' : 'award')}</div><span class="eyebrow">CHALLENGE COMPLETE</span><h3>Result recorded for ${escapeHTML(participantName)}.</h3><p class="result-message">${topTenMessage}</p><div class="result-stats"><div><strong>${result.score}<small>/100</small></strong><span>POINTS</span></div><div><strong>${result.rank}<small> / ${result.totalParticipants}</small></strong><span>OVERALL RANK</span></div><div><strong>${formatTime(result.durationMs)}</strong><span>TOTAL TIME</span></div></div><p class="privacy-note">${icon('lock-keyhole')} UPS ID ${escapeHTML(result.maskedUpsId)} is masked on the public leaderboard.</p><section class="answer-review"><h4>Your answers</h4>${questions.map((question, index) => { const selected = answers[index]; return `<article class="review-item"><div class="review-heading"><span>${String(index + 1).padStart(2, '0')} / ${question.category}</span></div><p>${question.question}</p><div class="review-answer"><span>Your answer</span><strong>${selected === null ? 'No answer' : escapeHTML(question.options[selected])}</strong></div></article>`; }).join('')}<div class="result-actions"><button class="button button-blue" id="see-results">View top ten ${icon('trophy')}</button></div></section></div>`;
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

function maskUpsId(value) {
  return `${'•'.repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function renderLeaderboard() {
  const tbody = byId('leaderboard-body');
  const empty = byId('empty-board');
  const note = byId('leaderboard-note');
  tbody.replaceChildren();
  empty.hidden = true;
  empty.querySelector('h3').textContent = 'First place is up for grabs.';
  empty.querySelector('p').textContent = 'Be among the first to complete the challenge.';
  note.textContent = 'Loading the shared top ten…';
  try {
    const { entries } = await requestResults('');
    empty.hidden = entries.length > 0;
    note.textContent = 'Top ten across all participants. Higher score wins; fastest total time breaks ties. UPS IDs are masked.';
    for (const [index, entry] of entries.entries()) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><span class="rank-number ${index < 3 ? `rank-${index + 1}` : ''}">${String(index + 1).padStart(2, '0')}</span></td><td><strong>${escapeHTML(entry.name)}</strong></td><td><strong>${escapeHTML(entry.maskedUpsId)}</strong></td><td><span class="score-cell">${entry.score}<small> pts</small></span></td><td>${formatTime(entry.durationMs)}</td>`;
      tbody.append(row);
    }
  } catch (error) {
    empty.hidden = false;
    empty.querySelector('h3').textContent = 'Leaderboard unavailable.';
    empty.querySelector('p').textContent = error.message;
    note.textContent = 'Connect the shared results service to load participant rankings.';
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
  const upsId = byId('participant-ups-id').value.trim().toUpperCase();
  if (name && upsId) {
    participantName = name.slice(0, 50);
    participantUpsId = upsId;
    showReady();
  }
});

byId('start-button').addEventListener('click', () => {
  byId('participant-ups-id').focus();
  byId('quiz-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
byId('refresh-leaderboard').addEventListener('click', renderLeaderboard);
byId('print-flyer').addEventListener('click', printFlyer);

renderLeaderboard();
showWelcome();
renderFlyer();
refreshIcons();
