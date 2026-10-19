// The database store, opened once per running server and shared by the
// leaderboard and license keys (in memory with LB_MEMORY=1, for tests and
// local runs). storeProblem() says why it isn't connected, in safe words.
import { databaseUrl, databaseProblem } from './service.js';

let ready = null;
let readyFor = null;
let problem = null;

export function openStore(env = {}) {
  const url = databaseUrl(env);
  const key = [url, env.LB_MEMORY].join('|');
  if (key !== readyFor) { readyFor = key; ready = null; }
  ready ??= (async () => {
    let store;
    if (!url && env.LB_MEMORY === '1') store = (await import('./memory-store.js')).memoryStore();
    else if ((problem = databaseProblem(url))) return null;
    else store = (await import('./sql-store.js')).sqlStore(url);
    await store.init();
    problem = null;
    return store;
  })().catch((err) => { problem = databaseProblem(url, err); ready = null; throw err; });
  return ready;
}

export const storeProblem = () => problem;
