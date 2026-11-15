'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
function createDownloads(directory, emit) {
  const active = new Map(),
    reserved = new Set();
  function attach(item) {
    const id = crypto.randomUUID(),
      filename = path.basename(item.getFilename());
    const ext = path.extname(filename),
      stem = path.basename(filename, ext);
    let destination = path.join(directory, filename),
      n = 1;
    while (fs.existsSync(destination) || reserved.has(destination))
      destination = path.join(directory, `${stem} (${n++})${ext}`);
    reserved.add(destination);
    item.setSavePath(destination);
    active.set(id, item);
    const data = () => ({
      id,
      filename: path.basename(destination),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      savePath: destination,
    });
    emit('download-started', data());
    item.on('updated', () => emit('download-progress', data()));
    item.once('done', (_, state) => {
      active.delete(id);
      reserved.delete(destination);
      emit('download-done', { ...data(), state });
    });
    return id;
  }
  return {
    attach,
    cancel(id) {
      const item = active.get(id);
      if (!item) return false;
      item.cancel();
      return true;
    },
    get size() {
      return active.size;
    },
  };
}
module.exports = { createDownloads };
