const { test } = require('node:test');
const assert = require('node:assert');

const auth = require('../server_util_funcs/auth');

function mockRes() {
  return {
    _headers: {},
    statusCode: undefined,
    setHeader(name, value) {
      this._headers[name] = value; 
    },
    status(code) {
      this.statusCode = code; return this; 
    },
    json(body) {
      this.body = body; return body; 
    },
  };
}

function mockReq({ body = {}, headers = {}, path = '/' } = {}) {
  return { body, headers, path };
}

function tokenFromCookie(res) {
  const cookie = res._headers['Set-Cookie'];
  assert.ok(cookie, 'expected a Set-Cookie header');
  return cookie.split(';')[0].split('=')[1];
}

test('isConfigured and isEnabled reflect env vars', () => {
  delete process.env.NUA_AUTH_ENABLED;
  delete process.env.NUA_AUTH_USERNAME;
  delete process.env.NUA_AUTH_PASSWORD;
  assert.strictEqual(auth.isConfigured(), false);
  assert.strictEqual(auth.isEnabled(), false);

  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  assert.strictEqual(auth.isConfigured(), true);
  assert.strictEqual(auth.isEnabled(), true);
});

test('login rejects with 400 when auth is disabled', () => {
  delete process.env.NUA_AUTH_ENABLED;
  delete process.env.NUA_AUTH_USERNAME;
  delete process.env.NUA_AUTH_PASSWORD;
  const res = mockRes();
  auth.login(mockReq({ body: { username: 'alice', password: 'secret' } }), res);
  assert.strictEqual(res.statusCode, 400);
});

test('login rejects invalid credentials with 401', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  const res = mockRes();
  auth.login(mockReq({ body: { username: 'alice', password: 'wrong' } }), res);
  assert.strictEqual(res.statusCode, 401);
});

test('login succeeds, sets a session cookie, and status reports authenticated', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  const res = mockRes();
  auth.login(mockReq({ body: { username: 'alice', password: 'secret' } }), res);
  assert.ok(res.body.success);
  assert.strictEqual(res.body.username, 'alice');
  const token = tokenFromCookie(res);

  const statusRes = mockRes();
  auth.status(mockReq({ headers: { cookie: `nua_session=${token}` } }), statusRes);
  assert.strictEqual(statusRes.body.enabled, true);
  assert.strictEqual(statusRes.body.authenticated, true);
  assert.strictEqual(statusRes.body.username, 'alice');
});

test('status reports unauthenticated without a session', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  const res = mockRes();
  auth.status(mockReq({}), res);
  assert.strictEqual(res.body.authenticated, false);
});

test('requireAuth rejects a protected path without a session', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  let nextCalled = false;
  const res = mockRes();
  auth.requireAuth(mockReq({ path: '/api/device-groups' }), res, () => {
    nextCalled = true; 
  });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test('requireAuth allows a public path without a session', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  let nextCalled = false;
  const res = mockRes();
  auth.requireAuth(mockReq({ path: '/health' }), res, () => {
    nextCalled = true; 
  });
  assert.strictEqual(nextCalled, true);
});

test('requireAuth allows a valid session and sets req.authUser', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  const loginRes = mockRes();
  auth.login(mockReq({ body: { username: 'alice', password: 'secret' } }), loginRes);
  const token = tokenFromCookie(loginRes);

  let nextCalled = false;
  let authUser = null;
  const req = mockReq({ path: '/api/device-groups', headers: { cookie: `nua_session=${token}` } });
  auth.requireAuth(req, mockRes(), () => {
    nextCalled = true; authUser = req.authUser; 
  });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(authUser, 'alice');
});

test('logout invalidates the session', () => {
  process.env.NUA_AUTH_USERNAME = 'alice';
  process.env.NUA_AUTH_PASSWORD = 'secret';
  const loginRes = mockRes();
  auth.login(mockReq({ body: { username: 'alice', password: 'secret' } }), loginRes);
  const token = tokenFromCookie(loginRes);

  const logoutRes = mockRes();
  auth.logout(mockReq({ headers: { cookie: `nua_session=${token}` } }), logoutRes);
  assert.ok(logoutRes.body.success);

  const statusRes = mockRes();
  auth.status(mockReq({ headers: { cookie: `nua_session=${token}` } }), statusRes);
  assert.strictEqual(statusRes.body.authenticated, false);
});
