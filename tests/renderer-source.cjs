'use strict';
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../src/renderer');

function rendererScripts() {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => {
    const src = /\bsrc="([^"]+)"/.exec(match[1]);
    return src ? { file: src[1], code: fs.readFileSync(path.join(directory, src[1]), 'utf8') }
      : { file: 'inline', code: match[2] };
  });
}

function rendererSource() {
  return fs.readFileSync(path.join(directory, 'index.html'), 'utf8') + '\n' +
    rendererScripts().map(script => script.code).join('\n');
}

module.exports = { rendererScripts, rendererSource };
