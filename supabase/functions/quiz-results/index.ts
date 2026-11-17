import { createClient } from 'npm:@supabase/supabase-js@2';

const answerKey = [2, 3, 2, 2, 1, 1, 2, 2, 2, 3];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function maskUpsId(upsId: string) {
  return `${'*'.repeat(Math.max(4, upsId.length - 2))}${upsId.slice(-2)}`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Results service is not configured.' }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('ups_id, display_name, score, duration_ms')
      .not('submitted_at', 'is', null)
      .order('score', { ascending: false })
      .order('duration_ms', { ascending: true })
      .order('submitted_at', { ascending: true })
      .limit(10);

    if (error) return json({ error: 'Could not load the leaderboard.' }, 500);
    return json({ entries: data.map(row => ({ name: row.display_name, maskedUpsId: maskUpsId(row.ups_id), score: row.score, durationMs: row.duration_ms })) });
  }

  let payload: { action?: string; upsId?: string; name?: string; attemptToken?: string; answers?: unknown };
  try { payload = await request.json(); }
  catch { return json({ error: 'Request must contain valid JSON.' }, 400); }

  const upsId = typeof payload.upsId === 'string' ? payload.upsId.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(upsId)) return json({ error: 'Enter a valid UPS ID using 2 to 64 letters, numbers, dots, underscores or hyphens.' }, 400);

  if (payload.action === 'start') {
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ').slice(0, 50) : '';
    if (!name) return json({ error: 'Enter your name before starting.' }, 400);

    const { data: existing, error: lookupError } = await supabase
      .from('quiz_attempts')
      .select('attempt_token, started_at, submitted_at, display_name')
      .eq('ups_id', upsId)
      .maybeSingle();
    if (lookupError) return json({ error: 'Could not start the quiz.' }, 500);
    if (existing?.submitted_at) return json({ error: 'This UPS ID has already submitted a quiz attempt.' }, 409);
    if (existing) return json({ attemptToken: existing.attempt_token, startedAt: existing.started_at });

    const attemptToken = crypto.randomUUID();
    const { data, error } = await supabase
      .from('quiz_attempts')
      .insert({ ups_id: upsId, display_name: name, attempt_token: attemptToken })
      .select('attempt_token, started_at')
      .single();
    if (error?.code === '23505') return json({ error: 'A quiz attempt is already registered for this UPS ID.' }, 409);
    if (error) return json({ error: 'Could not start the quiz.' }, 500);
    return json({ attemptToken: data.attempt_token, startedAt: data.started_at });
  }

  if (payload.action !== 'submit') return json({ error: 'Unknown quiz action.' }, 400);
  if (typeof payload.attemptToken !== 'string' || !Array.isArray(payload.answers) || payload.answers.length !== answerKey.length) {
    return json({ error: 'The quiz submission is incomplete or invalid.' }, 400);
  }
  if (!payload.answers.every(answer => answer === null || (Number.isInteger(answer) && answer >= 0 && answer < 4))) {
    return json({ error: 'One or more selected answers are invalid.' }, 400);
  }

  const { data: attempt, error: attemptError } = await supabase
    .from('quiz_attempts')
    .select('ups_id, attempt_token, started_at, submitted_at, score, duration_ms')
    .eq('ups_id', upsId)
    .eq('attempt_token', payload.attemptToken)
    .maybeSingle();
  if (attemptError) return json({ error: 'Could not verify this quiz attempt.' }, 500);
  if (!attempt) return json({ error: 'This quiz attempt could not be verified. Start a new attempt.' }, 403);
  if (attempt.submitted_at) {
    const { data: previousResults, error: previousRankError } = await supabase
      .from('quiz_attempts')
      .select('ups_id, score, duration_ms, submitted_at')
      .not('submitted_at', 'is', null)
      .order('score', { ascending: false })
      .order('duration_ms', { ascending: true })
      .order('submitted_at', { ascending: true })
      .limit(10000);
    if (previousRankError) return json({ error: 'Your result was recorded, but rank is temporarily unavailable.' }, 500);
    const previousRank = previousResults.findIndex(row => row.ups_id === upsId) + 1;
    return json({ score: attempt.score, rank: previousRank, totalParticipants: previousResults.length, durationMs: attempt.duration_ms, maskedUpsId: maskUpsId(upsId) });
  }

  const submittedAt = new Date();
  const durationMs = Math.max(1, submittedAt.getTime() - new Date(attempt.started_at).getTime());
  const score = payload.answers.reduce((total: number, answer: unknown, index: number) => total + (answer === answerKey[index] ? 10 : 0), 0);
  const { data: savedAttempt, error: saveError } = await supabase
    .from('quiz_attempts')
    .update({ score, duration_ms: durationMs, submitted_at: submittedAt.toISOString() })
    .eq('ups_id', upsId)
    .eq('attempt_token', payload.attemptToken)
    .is('submitted_at', null)
    .select('ups_id')
    .maybeSingle();
  if (saveError) return json({ error: 'Could not save your quiz result.' }, 500);
  if (!savedAttempt) return json({ error: 'This UPS ID has already submitted a quiz attempt.' }, 409);

  const { data: ranked, error: rankError } = await supabase
    .from('quiz_attempts')
    .select('ups_id, score, duration_ms, submitted_at')
    .not('submitted_at', 'is', null)
    .order('score', { ascending: false })
    .order('duration_ms', { ascending: true })
    .order('submitted_at', { ascending: true })
    .limit(10000);
  if (rankError) return json({ error: 'Your result was recorded, but rank is temporarily unavailable.' }, 500);

  const rank = ranked.findIndex(row => row.ups_id === upsId) + 1;
  return json({ score, rank, totalParticipants: ranked.length, durationMs, maskedUpsId: maskUpsId(upsId) });
});
