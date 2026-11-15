const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(chrome)) throw Error('Google Chrome was not found.');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runtime = path.join(__dirname, '.runtime', 'chrome-compare-' + Date.now());
fs.mkdirSync(runtime, { recursive: true });

const server = http.createServer((_, response) => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`<!doctype html><title>Chrome bellek baskı testi</title><canvas width="1280" height="720"></canvas><main></main><script>
    const heap=[];for(let i=0;i<6;i++){const block=new Uint8Array(1024*1024);block.fill(i+1);heap.push(block)}
    const main=document.querySelector('main');for(let i=0;i<1400;i++){const el=document.createElement('span');el.textContent='Browser '+i;main.appendChild(el)}
    const ctx=document.querySelector('canvas').getContext('2d');for(let i=0;i<1200;i++){ctx.fillStyle='hsl('+i%360+' 70% 55%)';ctx.fillRect(i%1280,(i*13)%720,18,18)}
    setInterval(()=>document.title='Chrome bellek baskı testi '+Date.now(),1000);
  </script>`);
});

function processTree(rootPid) {
  const script = `$root=${rootPid};$all=Get-CimInstance Win32_Process;$ids=[System.Collections.Generic.List[int]]::new();$ids.Add($root);do{$before=$ids.Count;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and-not $ids.Contains([int]$p.ProcessId)){$ids.Add([int]$p.ProcessId)}}}while($ids.Count-ne $before);$out=@();foreach($id in $ids){$p=Get-Process -Id $id -ErrorAction SilentlyContinue;if($p){$out+=[pscustomobject]@{pid=$p.Id;privateBytes=$p.PrivateMemorySize64;workingSet=$p.WorkingSet64}}};$out|ConvertTo-Json -Compress`;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
  }).trim();
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function runScenario(name, urls) {
  const profile = path.join(runtime, name);
  const args = [
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--password-store=basic',
    ...urls,
  ];
  const child = spawn(chrome, args, { stdio: 'ignore' });
  await delay(15000);
  const processes = processTree(child.pid);
  const result = {
    name,
    processCount: processes.length,
    privateMB: Math.round(
      processes.reduce((sum, item) => sum + item.privateBytes, 0) / 1024 / 1024,
    ),
    workingSetMB: Math.round(
      processes.reduce((sum, item) => sum + item.workingSet, 0) / 1024 / 1024,
    ),
    processes,
  };
  const ids = processes.map((item) => item.pid).filter(Number.isInteger);
  if (ids.length) {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Stop-Process -Id ${ids.join(',')} -Force -ErrorAction SilentlyContinue`,
    ]);
  }
  await delay(1200);
  return result;
}

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/stress`;
  const report = {
    measuredAt: new Date().toISOString(),
    chrome: await runScenario('idle', ['about:blank']),
  };
  report.stress = await runScenario(
    'eight-tabs',
    Array.from({ length: 8 }, (_, i) => url + '?tab=' + i),
  );
  server.close();
  fs.writeFileSync(
    path.join(__dirname, 'results', 'chrome-memory.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('CHROME', JSON.stringify(report));
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
