import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrls,
  formatCallDuration,
  formatMessageTime,
  getInitials,
  validatePassword,
  validateUsername,
} from './validation';

test('validateUsername normalizes @ prefix and lowercase', () => {
  const res = validateUsername('  @Maya_Studio ');
  assert.equal(res.ok, true);
  assert.equal(res.normalized, 'maya_studio');
});

test('validateUsername rejects invalid characters and short names', () => {
  assert.equal(validateUsername('ab').ok, false);
  assert.equal(validateUsername('maya@home.com').ok, false);
  assert.equal(validateUsername('hello world').ok, false);
});

test('validatePassword enforces minimum length', () => {
  assert.equal(validatePassword('12345').ok, false);
  assert.equal(validatePassword('123456').ok, true);
});

test('extractUrls finds clean http/https URLs without trailing punctuation', () => {
  const urls = extractUrls('Check https://example.com/docs?id=4, and http://famy.app/call!');
  assert.deepEqual(urls, ['https://example.com/docs?id=4', 'http://famy.app/call']);
});

test('formatCallDuration formats seconds accurately', () => {
  assert.equal(formatCallDuration(0), '0:00');
  assert.equal(formatCallDuration(9), '0:09');
  assert.equal(formatCallDuration(65), '1:05');
  assert.equal(formatCallDuration(3661), '1:01:01');
});

test('formatMessageTime handles today, yesterday, and older dates', () => {
  const now = new Date('2026-11-20T15:00:00Z').getTime();
  const earlierToday = new Date('2026-11-20T11:30:00Z').getTime();
  const yesterday = new Date('2026-11-19T18:00:00Z').getTime();
  const older = new Date('2026-10-05T10:00:00Z').getTime();

  assert.notEqual(formatMessageTime(earlierToday, now), 'Yesterday');
  assert.equal(formatMessageTime(yesterday, now), 'Yesterday');
  assert.match(formatMessageTime(older, now), /Oct/);
});

test('getInitials generates clean 2-character initials', () => {
  assert.equal(getInitials('maya_lin'), 'ML');
  assert.equal(getInitials('liam'), 'LI');
  assert.equal(getInitials(''), 'FM');
});
