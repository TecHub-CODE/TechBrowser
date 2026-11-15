'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function atomicWrite(file, value) {
  const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp, value, { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function createStore(directory, safeStorage, secret) {
  let cached;
  function key() {
    if (cached) return cached;
    if (secret) return (cached = crypto.createHash('sha256').update(secret).digest());
    const protectedFile = path.join(directory, '.techbrowser_enc_key.protected');
    const legacy = path.join(directory, '.techbrowser_enc_key');
    if (fs.existsSync(protectedFile)) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error('İşletim sistemi anahtar kasası kullanılamıyor.');
      const result = Buffer.from(safeStorage.decryptString(fs.readFileSync(protectedFile)), 'hex');
      if (result.length !== 32) throw new Error('Şifreleme anahtarı bozuk.');
      return (cached = result);
    }
    let result;
    if (fs.existsSync(legacy)) {
      result = fs.readFileSync(legacy);
      if (result.length !== 32) throw new Error('Eski şifreleme anahtarı bozuk; veri korunuyor.');
    } else {
      // Never replace a lost key when encrypted user files still exist.
      const existing = [
        'techbrowser-data.json',
        'techbrowser-passwords.json',
        'techbrowser-users.json',
        'techbrowser-otp.json',
        'techbrowser-auth.json',
        'techbrowser-ai-keys.json',
        'techbrowser-profiles.json',
      ];
      if (
        existing.some((name) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')).v === 2;
          } catch {
            return false;
          }
        })
      )
        throw new Error('Şifreleme anahtarı kayıp. Mevcut verilerin üzerine yazılmadı.');
      result = crypto.randomBytes(32);
    }
    if (!safeStorage.isEncryptionAvailable())
      throw new Error('Güvenli anahtar saklama kullanılamıyor.');
    atomicWrite(protectedFile, safeStorage.encryptString(result.toString('hex')));
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    return (cached = result);
  }
  function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return JSON.stringify({
      v: 2,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      data: data.toString('hex'),
    });
  }
  function decrypt(raw) {
    const value = JSON.parse(raw);
    if (!value || value.v !== 2) return value;
    function open(candidate) {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        candidate,
        Buffer.from(value.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      return JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(value.data, 'hex')), decipher.final()]).toString(
          'utf8',
        ),
      );
    }
    const primary = key();
    try {
      return open(primary);
    } catch (error) {
      // Older app versions can recreate the legacy key beside the OS-protected
      // key. Mixed-generation files must be authenticated individually.
      const legacy = path.join(directory, '.techbrowser_enc_key');
      if (fs.existsSync(legacy)) {
        const candidate = fs.readFileSync(legacy);
        if (candidate.length === 32 && !candidate.equals(primary)) {
          try {
            return open(candidate);
          } catch (_) {
            /* Preserve original failure. */
          }
        }
      }
      throw error;
    }
  }
  return {
    encrypt,
    decrypt,
    write(file, value) {
      if (fs.existsSync(file)) decrypt(fs.readFileSync(file, 'utf8'));
      atomicWrite(file, encrypt(value));
    },
  };
}
module.exports = { createStore, atomicWrite };
