import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const target = new URL('../.runtime/firebase/firestore.jar', import.meta.url);
const checksum = '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const verify = (data) => createHash('sha256').update(data).digest('hex') === checksum;
try {
  if (verify(await readFile(target))) {
    console.log('Firestore 1.22.0 already verified');
    process.exit(0);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const response = await fetch(
  'https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar',
  { signal: AbortSignal.timeout(180000) },
);
if (!response.ok) throw Error('Firestore download failed: ' + response.status);
const archive = Buffer.from(await response.arrayBuffer());
if (!verify(archive)) throw Error('Firestore checksum mismatch; downloaded data will not be used');
await mkdir(new URL('../.runtime/firebase/', import.meta.url), { recursive: true });
await writeFile(target, archive);
console.log('Firestore 1.22.0 downloaded and verified');
