const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const preview = process.argv.includes('--preview');
const capture = process.argv.includes('--capture');
const captureUninstaller = process.argv.includes('--capture-uninstaller');
const win81 = process.argv.includes('--win81');
const visualOnly = preview || capture || captureUninstaller;
const output = path.join(root, 'dist');
const builderOutput = win81 ? path.join(output, 'win81-build') : output;
const generated = path.join(root, 'installer', 'generated');
const csc = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const framework = path.dirname(csc);

fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(generated, { recursive: true });
if (!fs.existsSync(csc)) throw Error('Windows .NET Framework C# compiler is required.');

function run(exe, args) {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(exe + ' exited ' + result.status);
}

const commonCompilerArgs = [
  '/nologo',
  '/win32manifest:' + path.join(root, 'installer/app.manifest.xml'),
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  '/win32icon:' + path.join(root, 'assets/icon.ico'),
  '/reference:' + path.join(framework, 'WPF/PresentationFramework.dll'),
  '/reference:' + path.join(framework, 'WPF/PresentationCore.dll'),
  '/reference:' + path.join(framework, 'WPF/WindowsBase.dll'),
  '/reference:System.Xaml.dll',
  '/reference:System.Windows.Forms.dll',
  '/reference:System.Core.dll',
  '/reference:System.IO.Compression.dll',
  '/reference:System.IO.Compression.FileSystem.dll',
];
const visualResources = [
  ['Window.xaml', 'window.xaml'],
  ['assets/glass.png', 'glass.png'],
  ['assets/browser.png', 'browser.png'],
  ['assets/studio.png', 'studio.png'],
];
function resources(args) {
  for (const [file, name] of visualResources)
    args.push('/resource:' + path.join(root, 'installer', file) + ',' + name);
}

// This branded executable is installed next to the native NSIS uninstaller.
const uninstallTarget = path.join(generated, 'TechBrowser-Uninstall.exe');
const uninstallArgs = [...commonCompilerArgs, '/out:' + uninstallTarget];
resources(uninstallArgs);
uninstallArgs.push(path.join(root, 'installer/Uninstall.cs'));
run(csc, uninstallArgs);

if (!visualOnly) {
  const coreArtifact = win81
    ? 'TechBrowser-Core-${version}-Win81.exe'
    : 'TechBrowser-Core-${version}.exe';
  const builderArgs = [
    require.resolve('electron-builder/cli.js'),
    '--win',
    'nsis',
    '--publish',
    'never',
    `-c.nsis.artifactName=${coreArtifact}`,
    '-c.nsis.runAfterFinish=false',
  ];
  // Electron 22 is the final Electron line that runs on Windows 8/8.1.
  // Keep it isolated from the supported Windows 10/11 build.
  if (win81) {
    builderArgs.push('-c.electronVersion=22.3.27');
    builderArgs.push(`-c.directories.output=${builderOutput}`);
  }
  run(process.execPath, builderArgs);
}

const payload = path.join(
  builderOutput,
  win81
    ? `TechBrowser-Core-${pkg.version}-Win81.exe`
    : `TechBrowser-Core-${pkg.version}.exe`,
);
const target = path.join(
  output,
  visualOnly
    ? 'TechBrowser-Setup-Preview.exe'
    : win81
      ? `TechBrowser-Setup-${pkg.version}-Win81-Legacy.exe`
      : `TechBrowser-Setup-${pkg.version}.exe`,
);
const setupArgs = [...commonCompilerArgs, '/out:' + target];
resources(setupArgs);
setupArgs.push(
  '/resource:' + path.join(root, 'installer/assets/setupintro-frames.zip') + ',setupintro-frames.zip',
);
setupArgs.push('/resource:' + path.join(root, 'LICENSE.txt') + ',license.txt');
if (!visualOnly) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(payload)).digest('hex');
  const hashFile = path.join(output, 'payload.sha256');
  fs.writeFileSync(hashFile, hash);
  setupArgs.push(
    '/resource:' + payload + ',payload.exe',
    '/resource:' + hashFile + ',payload.sha256',
  );
}
setupArgs.push(path.join(root, 'installer/Setup.cs'));
run(csc, setupArgs);
console.log('Created:', target);

if (preview || capture) {
  const ready = process.argv.includes('--ready');
  const params = capture
    ? [
        '--capture',
        path.join(output, ready ? 'installer-ready.png' : 'installer-preview.png'),
        ...(ready ? ['--ready'] : []),
      ]
    : ['--preview'];
  const child = spawn(target, params, { stdio: 'inherit' });
  child.on('exit', (code) => (process.exitCode = code || 0));
}
if (captureUninstaller) {
  const child = spawn(
    uninstallTarget,
    ['--preview', '--capture', path.join(output, 'uninstaller-preview.png')],
    { stdio: 'inherit' },
  );
  child.on('exit', (code) => (process.exitCode = code || 0));
}
