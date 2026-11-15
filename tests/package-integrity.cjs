const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

(async () => {
  const asar = await import('@electron/asar');
  const pkg = require('../package.json');
  const archive = path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar');
  const entries = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
  assert.equal(entries.some(file => /(^|\/)\.env($|\.)|\.env$|^\/tests\//.test(file)), false);
  const read = file => asar.extractFile(archive, path.normalize(file));
  assert.equal(JSON.parse(read('package.json')).version, pkg.version);
  const root = path.resolve(__dirname, '..');
  const checked = [];
  function verify(file) {
    const absolute = path.join(root, file);
    if (fs.statSync(absolute).isDirectory()) {
      for (const child of fs.readdirSync(absolute)) verify(path.join(file, child));
    } else {
      assert.deepEqual(read(file), fs.readFileSync(absolute), file);
      checked.push(file);
    }
  }
  for (const file of ['main.js', 'preload.js', 'webview-preload.js', 'LICENSE.txt', 'src']) verify(file);
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'dist/win-unpacked/TechBrowser-Uninstall.exe')),
    fs.readFileSync(path.join(root, 'installer/generated/TechBrowser-Uninstall.exe')),
    'branded uninstaller must be installed beside the browser executable',
  );
  const metadata = fs.readFileSync(path.join(root, 'dist/latest.yml'), 'utf8');
  assert.ok(metadata.includes(`TechBrowser-Core-${pkg.version}.exe`));
  const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const artifacts = ['Core', 'Setup'].map(type => {
    const name = `TechBrowser-${type}-${pkg.version}.exe`;
    const file = path.join(root, 'dist', name);
    return { name, size: fs.statSync(file).size, sha256: sha256(file) };
  });
  const core = path.join(root, 'dist', artifacts[0].name);
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(core)).digest('base64');
  assert.ok(metadata.includes(sha512), 'Updater digest must match the actual Core installer');
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'results', `release-${pkg.version}.json`), JSON.stringify({
    version: pkg.version, checkedSourceFiles: checked.length, environmentFilesExcluded: true,
    updaterDigestMatches: true, artifacts,
  }, null, 2));
  console.log(`PASS ${checked.length} packaged source files match, secrets excluded, updater digest verified`);
})().catch(error => { console.error(error); process.exitCode = 1; });
