const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const cred = require('../server_util_funcs/credentialCrypto');

const VALID_KEY = crypto.randomBytes(32).toString('hex');
const INVALID_KEY = 'not-a-valid-64-char-hex-key';

// The module caches the key once it is loaded from the env var or key file, so
// tests run in a strict order: no-key first (cache is empty), then the invalid
// key (throws before caching), then the valid key (round-trip).

test('passthrough when no key is configured', () => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  assert.strictEqual(cred.isEncryptionEnabled(), false);
  assert.strictEqual(cred.encrypt('secret'), 'secret');
  assert.strictEqual(cred.decrypt('secret'), 'secret');
});

test('decrypt throws for an ENC: value when no key is configured', () => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  assert.throws(() => cred.decrypt('ENC:AAAA'), /key is required/i);
});

test('encrypt throws when the env key is not a 64-char hex string', () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = INVALID_KEY;
  assert.throws(() => cred.encrypt('secret'), /64-character hex/i);
});

test('encrypt/decrypt round-trip with a valid env key', () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = VALID_KEY;
  assert.strictEqual(cred.isEncryptionEnabled(), true);
  const enc = cred.encrypt('my-secret');
  assert.notStrictEqual(enc, 'my-secret');
  assert.ok(enc.startsWith('ENC:'));
  assert.strictEqual(cred.decrypt(enc), 'my-secret');
});

test('decrypt passthrough for non-ENC values', () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = VALID_KEY;
  assert.strictEqual(cred.decrypt('plain'), 'plain');
});
