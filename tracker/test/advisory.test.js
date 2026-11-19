import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { isBlockedAddress, checkAdvisoryUrl, fetchAdvisory, htmlToText, advisoryRoute } from '../server/advisoryFetch.js';
import { inventoryTerms, extractAdvisory, checkApps, fixVerdict, findProduct } from '../shared/advisory.js';
import { analyzeWorkbook, setClock } from '../shared/techRisk.js';

setClock(() => new Date('2026-11-19T00:00:00Z'));

const ADVISORY = `nginx2root: five memory-safety flaws in NGINX
Affected products and versions
NGINX Open Source before 1.30.7 or 1.31.9
NGINX Plus 37.x before 37.0.8.1 or 37.3.0.1
F5 lists NGINX Plus R33 and later R releases as affected, with no fixed build.
Fixed versions
NGINX Open Source 1.30.7 or 1.31.9
NGINX Plus 37.0.8.1 or 37.3.0.1
CVE | Flaw | Affected from
CVE-2026-123007 | HTTP/2 flow-control overflow | 1.9.5
CVE-2026-123633 | HTTP/2 use-after-free | 1.19.7
Severity: F5 rates each of the five as High (CVSS 3.1 8.1) and Critical (CVSS 4.0 9.2).
Update to a fixed version and restart nginx. PHP itself is not affected.`;

const workbook = () => analyzeWorkbook([{ name: 'App Architecture', rows: [
  ['App Name', 'Backend / Framework', 'Language(s)', 'Hosting / Deployment'],
  ['Buzz', 'Laravel Lumen 6 (php-fpm + Nginx)', 'PHP 7.4', 'AWS ECS'],
  ['Neo', 'Laravel 11 (nginx:1.25-alpine)', 'PHP 8.3', 'AWS ECS'],
  ['Fresh', 'Laravel 12, nginx 1.31.9', 'PHP 8.5', 'AWS ECS'],
  ['Edge', 'NGINX Plus R34 gateway', 'Go', 'VM'],
  ['Other', 'Express', 'Node 22', 'AWS ECS'],
] }]);

test('private, loopback, link-local, CGNAT and metadata addresses are blocked', () => {
  for (const ip of ['10.6.99.213', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '100.70.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '2002:a00::1', 'not-an-ip']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '104.16.0.1', '2606:4700::1']) assert.equal(isBlockedAddress(ip), false, ip);
});

test('only public https links on the standard port are accepted', () => {
  for (const bad of ['http://example.com/a', 'https://localhost/x', 'https://10.0.0.5/x', 'https://user:pw@example.com/', 'https://example.com:8443/', 'https://intranet/', 'https://x.internal/', 'file:///etc/passwd', 'nonsense']) {
    assert.throws(() => checkAdvisoryUrl(bad), bad);
  }
  assert.equal(checkAdvisoryUrl('https://radar.cloudflare.com/zero-wire/nginx2root#top').toString(), 'https://radar.cloudflare.com/zero-wire/nginx2root');
});

// A fake https.request: answers from a table of url -> { status, headers, body }.
function fakeRequest(pages, seen = []) {
  return (opts, onRes) => {
    const req = new EventEmitter();
    req.end = () => {
      const key = `https://${opts.hostname}${opts.path}`;
      seen.push({ key, address: opts.lookup });
      const p = pages[key] || { status: 404, headers: {}, body: '' };
      const res = new PassThrough();
      res.statusCode = p.status;
      res.headers = p.headers;
      setImmediate(() => { onRes(res); res.end(p.body); });
    };
    req.destroy = (e) => req.emit('error', e);
    return req;
  };
}
const publicDns = async () => [{ address: '104.16.0.1', family: 4 }];

test('a page is fetched and reduced to text; scripts are dropped', async () => {
  const request = fakeRequest({ 'https://adv.example.com/a': { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>Adv &amp; co</title><script>steal()</script><h1>NGINX</h1><p>before 1.30.7</p>' } });
  const r = await fetchAdvisory('https://adv.example.com/a', { lookup: publicDns, request });
  assert.equal(r.title, 'Adv & co');
  assert.equal(r.text, 'NGINX\nbefore 1.30.7');
  assert.equal(htmlToText('<table><tr><td>a</td><td>b</td></tr></table>'), 'a | b');
});

test('a host that resolves to a private address, or a redirect to one, is refused', async () => {
  await assert.rejects(fetchAdvisory('https://evil.example.com/', { lookup: async () => [{ address: '10.6.99.213', family: 4 }], request: fakeRequest({}) }), /public/);
  await assert.rejects(fetchAdvisory('https://mixed.example.com/', { lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], request: fakeRequest({}) }), /public/);
  const request = fakeRequest({ 'https://adv.example.com/r': { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' }, body: '' } });
  await assert.rejects(fetchAdvisory('https://adv.example.com/r', { lookup: publicDns, request }), /public/);
  const http = fakeRequest({ 'https://adv.example.com/r': { status: 301, headers: { location: 'http://adv.example.com/plain' }, body: '' } });
  await assert.rejects(fetchAdvisory('https://adv.example.com/r', { lookup: publicDns, request: http }), /https/);
});

test('downloads and non-text pages are refused', async () => {
  const request = fakeRequest({ 'https://adv.example.com/f.pdf': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF' } });
  await assert.rejects(fetchAdvisory('https://adv.example.com/f.pdf', { lookup: publicDns, request }), /not a web page/);
});

test('the route is rate limited per user', async () => {
  const route = advisoryRoute({ fetcher: async () => ({ url: 'https://a.example.com/', title: '', text: 'x', fetchedAt: '' }), perMinute: 2 });
  const call = async () => {
    let status = 200;
    const res = { status(s) { status = s; return this; }, json() { return this; } };
    await route({ user: { email: 'a@b.c' }, body: { url: 'https://a.example.com/' } }, res);
    return status;
  };
  assert.deepEqual([await call(), await call(), await call()], [200, 200, 429]);
});

test('products named in both the advisory and the workbook are proposed with their fixed versions', () => {
  const { apps } = workbook();
  const terms = inventoryTerms(apps);
  assert.ok(terms.includes('Nginx'));
  assert.ok(!terms.some((t) => /^language|^hosting/i.test(t)), 'column labels are not products');
  const a = extractAdvisory(ADVISORY, terms, { title: 'nginx2root' });
  assert.equal(a.severity, 'Critical');
  assert.deepEqual(a.cves.map((c) => c.id).sort(), ['CVE-2026-123007', 'CVE-2026-123633']);
  const nginx = a.products.find((p) => p.name === 'Nginx');
  assert.deepEqual(nginx.fixed, ['1.30.7', '1.31.9']); // NGINX Plus versions and "affected from" versions are not taken
  assert.equal(nginx.include, true);
  const php = a.products.find((p) => p.name === 'PHP');
  assert.equal(php?.include, false); // named, but no fixed version: proposed unticked
});

test('apps are rated affected, possibly affected or patched', () => {
  const { apps } = workbook();
  const a = extractAdvisory(ADVISORY, inventoryTerms(apps), { title: 'nginx2root' });
  const rows = checkApps(apps, a);
  const by = Object.fromEntries(rows.map((r) => [r.app, r]));
  assert.equal(by.Neo.state, 'affected');
  assert.equal(by.Neo.fix, '1.30.7');
  assert.equal(by.Neo.severity, 'Critical');
  assert.equal(by.Buzz.state, 'possible');
  assert.equal(by.Buzz.why, 'version not stated');
  assert.equal(by.Buzz.severity, 'High');
  assert.equal(by.Fresh.state, 'patched');
  assert.equal(by.Edge, undefined); // NGINX Plus is a different product
  assert.equal(by.Other, undefined);
  assert.equal(by.Neo.hosting, 'AWS ECS');
});

test('fixed-version rules per release branch', () => {
  const fx = ['1.30.7', '1.31.9'];
  assert.equal(fixVerdict('1.30.6', fx).state, 'affected');
  assert.equal(fixVerdict('1.30.7', fx).state, 'patched');
  assert.equal(fixVerdict('1.31.2', fx).fix, '1.31.9');
  assert.equal(fixVerdict('1.29.1', fx).fix, '1.30.7');
  assert.equal(fixVerdict('1.32.0', fx).state, 'patched');
  assert.equal(fixVerdict('1.30', fx).state, 'possible');
  assert.equal(findProduct('image nginx:stable', { match: ['nginx'] }).floating, 'stable');
});

test('protocol, score, kernel and "and later" versions are not taken as fixes', () => {
  const text = `Same-release fix: CVE-2026-118899
The most serious, CVE-2026-118899, is an infinite loop while reading a request body over TLS 1.3 that lets an attacker stall a worker process, in nginx 1.13.0 and later. nginx.org rates it major and F5 rates it High (CVSS 3.1 7.5).
Xint also reports a use-after-free in the Linux kernel's SCTP send path, present since v4.15, which it chained with CVE-2026-123007 to gain root on the host, including from nginx in a Docker container.
Fixed versions
nginx 1.30.7 or 1.31.9. Upgrade to 1.31.9 or later.`;
  const a = extractAdvisory(text, ['Nginx', 'Docker'], { title: 'nginx2root' });
  assert.deepEqual(a.products.find((p) => p.name === 'Nginx').fixed, ['1.30.7', '1.31.9']);
  const docker = a.products.find((p) => p.name === 'Docker');
  assert.deepEqual(docker.fixed, []);
  assert.equal(docker.include, false);
});
