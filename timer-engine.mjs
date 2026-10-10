export const COLORS = ['mint', 'peach', 'lavender', 'blue', 'rose', 'sand'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const makeTimers = names => names.map((name, i) => ({ id: uid(), name, color: COLORS[i % COLORS.length], elapsed: 0 }));
export function createSession(names = ['本文を読む', '問題を解く']) {
  return { title: '読解トレーニング', timers: makeTimers(names), activeId: null, lastId: null, startedAt: null };
}
export function elapsed(timer, session, now = Date.now()) {
  return timer.elapsed + (session.activeId === timer.id ? Math.max(0, now - session.startedAt) : 0);
}
export function total(session, now = Date.now()) {
  return session.timers.reduce((sum, timer) => sum + elapsed(timer, session, now), 0);
}
export function settle(session, now = Date.now()) {
  const timer = session.timers.find(t => t.id === session.activeId);
  if (timer) timer.elapsed = elapsed(timer, session, now);
  session.activeId = null;
  session.startedAt = null;
}
export function activate(session, id, now = Date.now()) {
  if (!session.timers.some(t => t.id === id) || session.activeId === id) return false;
  settle(session, now);
  session.activeId = id;
  session.lastId = id;
  session.startedAt = now;
  return true;
}
export function reset(session) {
  session.timers.forEach(t => { t.elapsed = 0; });
  session.activeId = null;
  session.startedAt = null;
  session.lastId = null;
}
export function validSession(s) {
  if (!s || !Array.isArray(s.timers) || s.timers.length < 1 || s.timers.length > 12) return false;
  if (typeof s.title !== 'string' || s.title.length > 60) return false;
  const ids = new Set();
  for (const t of s.timers) {
    if (!t || typeof t.id !== 'string' || ids.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 40 || !COLORS.includes(t.color) || !Number.isFinite(t.elapsed) || t.elapsed < 0) return false;
    ids.add(t.id);
  }
  if (s.lastId !== null && !ids.has(s.lastId)) return false;
  return s.activeId === null ? s.startedAt === null : ids.has(s.activeId) && Number.isFinite(s.startedAt) && s.startedAt >= 0;
}
export function timeParts(ms, withHours = false) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const sec = Math.floor(tenths / 10);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor(sec / 60) % 60;
  return { main: withHours || hours ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}` : `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`, fraction: tenths % 10 };
}
