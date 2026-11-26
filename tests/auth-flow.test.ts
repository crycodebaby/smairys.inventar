import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReturnError, loginRedirectUrl } from '../src/auth-flow.ts';

test('login returns to the configured live origin and preserves only the OAuth request', () => {
  const url = loginRedirectUrl('https://preview.vercel.app/?authorization_id=request-123&redirect_to=https://other.example/#access_token=private', 'https://inventar.smairys.de');
  assert.equal(url, 'https://inventar.smairys.de/?authorization_id=request-123');
  assert.equal(loginRedirectUrl('https://inventar.smairys.de/', 'https://inventar.smairys.de'), 'https://inventar.smairys.de/');
  assert.equal(loginRedirectUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173'), 'http://127.0.0.1:5173/');
  assert.throws(() => loginRedirectUrl('https://inventar.smairys.de/', 'http://external.example'));
});

test('expired links get a useful message without echoing untrusted fragment text or tokens', () => {
  assert.match(authReturnError('https://inventar.smairys.de/#error=access_denied&error_code=otp_expired&error_description=private-value')!, /abgelaufen oder wurde bereits verwendet/);
  assert.equal(authReturnError('https://inventar.smairys.de/#access_token=private&refresh_token=private'), null);
  assert.equal(authReturnError('https://inventar.smairys.de/'), null);
  assert.doesNotMatch(authReturnError('https://inventar.smairys.de/#error=oops&error_description=private-value')!, /private-value/);
});
