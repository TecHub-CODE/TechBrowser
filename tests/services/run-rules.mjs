import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync, mkdirSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(here, '../.runtime');
const bundled = path.join(runtime, 'java');
const jre = existsSync(bundled) && readdirSync(bundled).find((name) => name.endsWith('-jre'));
const java =
  process.env.TECHBROWSER_TEST_JAVA || (jre ? path.join(bundled, jre, 'bin/java.exe') : 'java');
const jar = process.env.TECHBROWSER_FIRESTORE_JAR || path.join(runtime, 'firebase/firestore.jar');
if (!existsSync(jar)) throw Error('Firestore emulator missing. See tests/services/README.md.');
const port = await new Promise((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
mkdirSync(path.join(runtime, 'firebase'), { recursive: true });
const log = createWriteStream(path.join(runtime, 'firebase/emulator.log'));
const emulator = spawn(
  java,
  [
    '-Duser.language=en',
    '-Duser.country=US',
    '-jar',
    jar,
    '--host=127.0.0.1',
    '--port=' + port,
    '--project_id=demo-techbrowser',
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
emulator.stdout.pipe(log);
emulator.stderr.pipe(log);
let startupError;
emulator.on('error', (error) => {
  startupError = error;
});
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (startupError) throw startupError;
    if (emulator.exitCode !== null)
      throw Error('Firestore emulator exited; see tests/.runtime/firebase/emulator.log');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
      ready = response.ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw Error('Firestore emulator did not become ready');
  const child = spawn(
    process.execPath,
    ['--test', '--test-timeout=30000', path.join(here, 'rules.test.mjs')],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
        GCLOUD_PROJECT: 'demo-techbrowser',
      },
    },
  );
  const timeout = setTimeout(() => child.kill(), 45000);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    clearTimeout(timeout);
  }
} finally {
  emulator.kill();
  log.end();
}
