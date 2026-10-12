// Standalone server: http://localhost:3010/DPSA (+ /FullAssessment, /RulesOfEngagement).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMonitor } from './monitor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3010);
const monitor = await createMonitor({ root });

// Localhost only: the page can change the token, so it must not be reachable from the network.
monitor.app.listen(port, '127.0.0.1', () => {
  console.log(`[monitor] http://localhost:${port}/DPSA${monitor.config.demo ? '  (demo data)' : ''}`);
  for (const m of monitor.config.assessments) console.log(`[monitor] http://localhost:${port}${m.page}`);
  monitor.start();
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`[monitor] Port ${port} is already in use (another copy of this app is probably running).`);
  console.error(`       Stop it with:  lsof -ti tcp:${port} | xargs kill`);
  console.error(`       or use another port:  PORT=3011 npm start`);
  process.exit(1);
});
