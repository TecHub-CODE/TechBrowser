'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normalizeVoiceQuery } = require('./voice-query');
const run = promisify(execFile);

function hasAudibleSignal(wav) {
  const windowBytes = 1024 * 2;
  let activeWindows = 0;
  for (let start = 44; start + windowBytes <= wav.length; start += windowBytes) {
    let energy = 0;
    for (let index = start; index < start + windowBytes; index += 2) {
      const sample = wav.readInt16LE(index) / 32768;
      energy += sample * sample;
    }
    if (energy / 1024 > 0.009 ** 2 && ++activeWindows >= 2) return true;
  }
  return false;
}

function createVoiceAssist(root) {
  const tool = path.join(root, 'Release', 'whisper-cli.exe');
  const model = path.join(root, 'model-base.bin');
  let transcribing = false;
  let reading;

  function available() {
    return process.platform === 'win32' && process.arch === 'x64' && Number(os.release().split('.')[0]) >= 10 &&
      fs.existsSync(tool) && fs.existsSync(model);
  }

  async function transcribe(bytes) {
    if (!available()) throw Error('Çevrimdışı sesli arama bu kurulumda bulunmuyor.');
    if (transcribing) throw Error('Bir sesli arama zaten işleniyor.');
    if (!(bytes instanceof Uint8Array) || bytes.length < 6444 || bytes.length > 384044)
      throw Error('Ses kaydı geçersiz.');
    const wav = Buffer.from(bytes);
    if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
        wav.readUInt32LE(4) !== wav.length - 8 || wav.readUInt32LE(16) !== 16 ||
        wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16000 ||
        wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data' ||
        wav.readUInt32LE(40) !== wav.length - 44 || wav.length % 2)
      throw Error('Ses biçimi desteklenmiyor.');
    if (!hasAudibleSignal(wav)) return '';
    transcribing = true;
    let temporary;
    try {
      temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'TechBrowser-voice-'));
      const input = path.join(temporary, 'speech.wav');
      const output = path.join(temporary, 'result');
      await fsp.writeFile(input, wav);
      await fsp.copyFile(model, path.join(temporary, 'model.bin'));
      // The Windows CLI uses narrow file paths. Relative ASCII names also work in Unicode profiles.
      await run(tool, [
        '-m', 'model.bin', '-f', 'speech.wav', '-l', 'tr', '-ng', '-t', '2',
        '-nf', '-bs', '5', '-sns', '-ojf', '-of', 'result',
        // Search context plus examples of short Turkish queries and proper nouns.
        '--prompt', 'Arama sorgusu: Mercedes, ansiklopedi, hava durumu, teknoloji, YouTube, Minecraft, Spotify, Discord, TikTok, GitHub.',
      ], {
        cwd: temporary, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024,
      });
      const { transcription } = JSON.parse(await fsp.readFile(output + '.json', 'utf8'));
      const words = transcription.flatMap((segment) => segment.tokens).filter(
        (token) => token.id < 50257 && /[\p{L}\p{N}]/u.test(token.text) && Number.isFinite(token.p),
      );
      const confidence = words.reduce((sum, token) => sum + token.p, 0) / words.length;
      if (!(confidence >= 0.40)) return '';
      return normalizeVoiceQuery(transcription.map((segment) => segment.text.trim()).join(' '));
    } finally {
      transcribing = false;
      if (temporary) await fsp.rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function speak(label) {
    reading?.abort();
    if (typeof label !== 'string' || !label.trim() || label.length > 160 || process.platform !== 'win32') return null;
    const controller = new AbortController();
    reading = controller;
    try {
      const script = fs.readFileSync(path.join(__dirname, 'voice-read.ps1'), 'utf8');
      const command = Buffer.from(script, 'utf16le').toString('base64');
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const { stdout } = await run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], {
        env: { ...process.env, TECHBROWSER_VOICE_LABEL: label },
        windowsHide: true, timeout: 6000, signal: controller.signal, maxBuffer: 1024 * 1024,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    } finally {
      if (reading === controller) reading = null;
    }
  }

  return { available, transcribe, speak };
}

module.exports = { createVoiceAssist };
