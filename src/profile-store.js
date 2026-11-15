'use strict';
const fs = require('node:fs');
const path = require('node:path');

function createProfileStore({ directory, store, nativeImage }) {
  const file = path.join(directory, 'techbrowser-profiles.json');
  function read() {
    try {
      const data = store.decrypt(fs.readFileSync(file, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error('Profil kaydı bozuk.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }
  function withAvatar(user) {
    if (!user) return null;
    const saved = read()[user.uid];
    return saved?.avatar ? { ...user, avatar: saved.avatar, misket: saved.misket || null } : user;
  }
  function saveAvatar(user, value, misket) {
    if (
      misket !== undefined &&
      (!misket ||
        !['white', 'black', 'custom', 'aurora'].includes(misket.variant) ||
        !/^#[0-9a-f]{6}$/i.test(misket.color) ||
        !/^#[0-9a-f]{6}$/i.test(misket.eyeColor) ||
        typeof misket.motion !== 'boolean')
    )
      throw Error('Misket tercihleri geçersiz.');
    const preferences = misket
      ? {
          variant: misket.variant,
          color: misket.color,
          eyeColor: misket.eyeColor,
          motion: misket.motion,
        }
      : null;
    if (!user?.uid) throw Error('Profil fotoğrafı için giriş yapın.');
    if (
      typeof value !== 'string' ||
      value.length > 2800000 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ) {
      throw Error('En fazla 2 MB boyutunda PNG, JPEG veya WebP seçin.');
    }
    const image = nativeImage.createFromDataURL(value);
    if (image.isEmpty()) throw Error('Resim okunamadı.');
    const { width, height } = image.getSize();
    if (width > 8192 || height > 8192)
      throw Error('Resim boyutları en fazla 8192 × 8192 olabilir.');
    const avatar = image.resize({ width: 256, height: 256, quality: 'best' }).toDataURL();
    const profiles = read();
    store.write(file, { ...profiles, [user.uid]: { avatar, misket: preferences } });
    return { ...user, avatar, misket: preferences };
  }
  return { withAvatar, saveAvatar };
}
module.exports = { createProfileStore };
