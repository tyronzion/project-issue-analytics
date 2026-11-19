import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedJiraHosts, checkUserJiraUrl, createSyncLimiter } from './jiraAccess.js';

test('users may only reach the team Jira over https', () => {
  const hosts = allowedJiraHosts({ JIRA_BASE_URL: 'https://cloudstaff.atlassian.net' });
  assert.deepEqual(hosts, ['cloudstaff.atlassian.net', '*.atlassian.net']);
  assert.equal(checkUserJiraUrl('https://cloudstaff.atlassian.net/jira/software/projects', hosts), 'https://cloudstaff.atlassian.net');
  assert.equal(checkUserJiraUrl('https://other.atlassian.net', hosts), 'https://other.atlassian.net');
  for (const bad of ['http://cloudstaff.atlassian.net', 'https://10.6.99.213', 'https://localhost', 'https://atlassian.net.evil.com', 'https://evilatlassian.net',
    'https://user:pw@cloudstaff.atlassian.net', 'https://cloudstaff.atlassian.net:8443', 'not a url']) {
    assert.throws(() => checkUserJiraUrl(bad, hosts), bad);
  }
});

test('JIRA_ALLOWED_HOSTS replaces the default list', () => {
  const hosts = allowedJiraHosts({ JIRA_ALLOWED_HOSTS: 'jira.example.com, *.example.org', JIRA_BASE_URL: 'https://x.atlassian.net' });
  assert.deepEqual(hosts, ['jira.example.com', '*.example.org']);
  assert.equal(checkUserJiraUrl('https://jira.example.com', hosts), 'https://jira.example.com');
  assert.throws(() => checkUserJiraUrl('https://x.atlassian.net', hosts));
  assert.throws(() => checkUserJiraUrl('https://example.org', hosts)); // wildcard needs a subdomain
});

test('user syncs are rate limited per person', () => {
  let t = 0;
  const allow = createSyncLimiter({ perMinute: 2, now: () => t });
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  t = 61_000;
  assert.equal(allow('a'), true);
});
