const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'onboarding.cjs')], {
  stdio: 'inherit',
  env,
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
