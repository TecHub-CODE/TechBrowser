'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

test('updated mail transport composes a Turkish OTP without contacting an SMTP server', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({
    from: 'TechBrowser <noreply@example.test>',
    to: 'test@example.test',
    subject: 'TechBrowser — Giriş Doğrulama Kodun',
    html: '<p>Giriş kodunuz: <b>123456</b></p>',
  });
  assert.deepEqual(result.envelope.to, ['test@example.test']);
  assert.match(result.message.toString(), /123456/);
  assert.match(result.message.toString(), /Content-Type: text\/html; charset=utf-8/);
});
