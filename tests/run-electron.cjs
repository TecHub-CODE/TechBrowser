const { spawn } = require('child_process');
const path = require('path');
const kind = process.argv[2];
if (!['integration', 'benchmark', 'memory-stress', 'storage-isolation'].includes(kind))
  throw Error('Choose integration, benchmark, memory-stress or storage-isolation');
const label = process.argv[3] || 'optimized-final';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid benchmark label');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = [
  path.join(__dirname, kind + '.cjs'),
  ...(['benchmark', 'memory-stress'].includes(kind) ? [label] : []),
];
if (process.env.TECHBROWSER_TEST_DISABLE_GPU === '1') args.push('--disable-gpu');
const child = spawn(require('electron'), args, { stdio: 'inherit', env });
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
