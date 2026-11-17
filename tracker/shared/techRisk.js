/**
 * Tech Risk Analyzer (D17): reads an application architecture workbook and reports, per application and per
 * repository, the technologies that are out of support and the versions with known vulnerabilities.
 * Pure functions, no I/O: the page (src/components/tracker/TechRisk.jsx) reads the file and renders.
 *
 * Built-in data was retrieved on KB_AS_OF from endoflife.date, OSV.dev, NVD, the Google Play target API policy and
 * vendor advisories (Angular, Next.js, n8n). `applyEndOfLifeRows` lets the page refresh lifecycles from endoflife.date.
 */


export const KB_AS_OF = "2026-11-17";
const DAY = 86400000;
const DATASTORES = new Set(["mysql","mariadb","postgresql","redis"]);

/* ------------------------------------------------------------------ */
/* Knowledge base: lifecycles (endoflife.date, retrieved 17 Nov 2026)  */
/* eol = security support ends; support = active/bug-fix support ends  */
/* ------------------------------------------------------------------ */
export const LIFECYCLE = {
  php:{name:"PHP", eolKey:"php", rec:"Upgrade to PHP 8.4 or 8.5", cycles:{
    "5.5":{eol:"2016-07-21",latest:"5.5.38"},"5.6":{eol:"2018-12-31",latest:"5.6.40"},"7.0":{eol:"2019-01-10",latest:"7.0.33"},
    "7.1":{eol:"2019-12-01",latest:"7.1.33"},"7.2":{eol:"2020-11-30",latest:"7.2.34"},"7.3":{eol:"2021-12-06",latest:"7.3.33"},
    "7.4":{eol:"2022-11-28",latest:"7.4.33"},"8.0":{eol:"2023-11-26",latest:"8.0.30"},"8.1":{eol:"2025-12-31",latest:"8.1.34"},
    "8.2":{eol:"2026-12-31",support:"2024-12-31",latest:"8.2.35"},"8.3":{eol:"2027-12-31",support:"2025-12-31",latest:"8.3.36"},
    "8.4":{eol:"2028-12-31",support:"2026-12-31",latest:"8.4.27"},"8.5":{eol:"2029-12-31",support:"2027-12-31",latest:"8.5.12"}}},
  angular:{name:"Angular", eolKey:"angular", rec:"Upgrade to Angular 21 or 22", cycles:{
    "8":{eol:"2020-11-28",latest:"8.2.14"},"9":{eol:"2021-08-06",latest:"9.1.13"},"10":{eol:"2021-12-24",latest:"10.2.5"},
    "11":{eol:"2022-05-11",latest:"11.2.14"},"12":{eol:"2022-11-12",latest:"12.2.17"},"13":{eol:"2023-05-04",latest:"13.4.0"},
    "14":{eol:"2023-11-18",latest:"14.3.0"},"15":{eol:"2024-05-18",latest:"15.2.10"},"16":{eol:"2024-11-08",latest:"16.2.12"},
    "17":{eol:"2025-05-15",latest:"17.3.12"},"18":{eol:"2025-11-21",latest:"18.2.14"},"19":{eol:"2026-05-19",latest:"19.2.25"},
    "20":{eol:"2026-11-28",support:"2025-11-19",latest:"20.3.35"},"21":{eol:"2027-06-30",support:"2026-06-03",latest:"21.2.26"},
    "22":{eol:"2028-06-30",support:"2027-06-30",latest:"22.2.6"}}},
  laravel:{name:"Laravel", eolKey:"laravel", rec:"Upgrade to Laravel 13 (or 12 short term)", cycles:{
    "6":{eol:"2022-09-06",latest:"6.20.45"},"7":{eol:"2021-03-03",latest:"7.30.7"},"8":{eol:"2023-01-24",latest:"8.83.29"},
    "9":{eol:"2024-02-06",latest:"9.52.23"},"10":{eol:"2025-02-04",latest:"10.50.4"},"11":{eol:"2026-03-12",latest:"11.57.1"},
    "12":{eol:"2027-02-24",support:"2026-08-13",latest:"12.72.0"},"13":{eol:"2028-03-17",support:"2027-09-30",latest:"13.42.0"}}},
  dotnet:{name:".NET", eolKey:"dotnet", rec:"Upgrade to .NET 10 (LTS, supported to Nov 2028)", cycles:{
    "2.1":{eol:"2021-08-21",latest:"2.1.30"},"3.1":{eol:"2022-12-13",latest:"3.1.32"},"5":{eol:"2022-05-10",latest:"5.0.17"},
    "6":{eol:"2024-11-12",latest:"6.0.36"},"7":{eol:"2024-05-14",latest:"7.0.20"},"8":{eol:"2026-11-10",latest:"8.0.34"},
    "9":{eol:"2026-11-10",latest:"9.0.23"},"10":{eol:"2028-11-14",latest:"10.0.15"}}},
  dotnetfx:{name:".NET Framework", eolKey:"dotnetfx", rec:"Move to .NET Framework 4.8.1 now; plan migration to .NET 10", cycles:{
    "4.5.2":{eol:"2022-04-26"},"4.6":{eol:"2022-04-26"},"4.6.1":{eol:"2022-04-26"},"4.6.2":{eol:"2027-01-12"},
    "4.7":{eol:null},"4.7.1":{eol:null},"4.7.2":{eol:null},"4.8":{eol:null},"4.8.1":{eol:null}}},
  nodejs:{name:"Node.js", eolKey:"nodejs", rec:"Upgrade to Node.js 24 LTS", cycles:{
    "12":{eol:"2022-04-30"},"13":{eol:"2020-06-01"},"14":{eol:"2023-04-30"},"16":{eol:"2023-09-11"},"18":{eol:"2025-04-30",latest:"18.20.8"},
    "20":{eol:"2026-04-30",latest:"20.20.2"},"22":{eol:"2027-04-30",support:"2025-10-21",latest:"22.23.5"},
    "24":{eol:"2028-04-30",support:"2026-10-20",latest:"24.22.3"},"26":{eol:"2029-04-30",support:"2027-10-27",latest:"26.13.1"}}},
  cakephp:{name:"CakePHP", eolKey:"cakephp", rec:"Upgrade to CakePHP 5.4", cycles:{
    "1.3":{eol:"2015-11-01",latest:"1.3.21"},"2":{eol:"2021-06-15",latest:"2.10.24"},"3":{eol:"2022-12-15",latest:"3.10.5"},
    "4.0":{minor:true,eol:"2025-09-09",latest:"4.6.6",note:"Only the latest 4.x minor (4.6) gets security fixes"},"4.1":{minor:true,eol:"2025-09-09",latest:"4.6.6"},
    "4.2":{minor:true,eol:"2025-09-09",latest:"4.6.6"},"4.3":{minor:true,eol:"2025-09-09",latest:"4.6.6"},"4.4":{minor:true,eol:"2025-09-09",latest:"4.6.6"},
    "4.5":{minor:true,eol:"2025-09-09",latest:"4.6.6",note:"Only the latest 4.x minor (4.6) gets security fixes"},
    "4.6":{eol:null,support:"2025-09-09",latest:"4.6.6"},"4":{eol:null,support:"2025-09-09",latest:"4.6.6",note:"Minor not stated; only 4.6 is still patched"},
    "5.0":{minor:true,eol:"2026-01-09",latest:"5.4.4"},"5.1":{eol:null,latest:"5.4.4",outdatedMinor:true},"5.2":{eol:null,latest:"5.4.4",outdatedMinor:true},
    "5.3":{eol:null,latest:"5.4.4",outdatedMinor:true},"5.4":{eol:null,latest:"5.4.4"},"5":{eol:null,latest:"5.4.4",note:"Minor not stated; confirm 5.4"}}},
  mysql:{name:"MySQL", eolKey:"mysql", rec:"Upgrade to MySQL 8.4 LTS", cycles:{
    "5.7":{eol:"2023-10-31",latest:"5.7.44"},"8.0":{eol:"2026-04-30",latest:"8.0.46"},"8.1":{eol:"2023-10-25"},"8.2":{eol:"2024-01-16"},
    "8.3":{eol:"2024-04-30"},"8.4":{eol:"2032-04-30",support:"2029-04-30",latest:"8.4.13"},"9.7":{eol:"2034-04-30",latest:"9.7.4"}}},
  mariadb:{name:"MariaDB", eolKey:"mariadb", rec:"Upgrade to MariaDB 11.4 or 11.8 LTS", cycles:{
    "10.3":{eol:"2023-05-25",latest:"10.3.39"},"10.4":{eol:"2024-06-18"},"10.5":{eol:"2025-06-24"},"10.6":{eol:"2026-07-06",latest:"10.6.28",note:"Community support ended; enterprise support to 2029"},
    "10.11":{eol:"2028-02-16",latest:"10.11.20"},"11.4":{eol:"2029-05-29",latest:"11.4.14"},"11.8":{eol:"2028-06-04",latest:"11.8.10"}}},
  postgresql:{name:"PostgreSQL", eolKey:"postgresql", rec:"Upgrade to PostgreSQL 17 or 18", cycles:{
    "11":{eol:"2023-11-09"},"12":{eol:"2024-11-21",latest:"12.22"},"13":{eol:"2025-11-13",latest:"13.23"},"14":{eol:"2026-11-12",latest:"14.25"},
    "15":{eol:"2027-11-11",latest:"15.20"},"16":{eol:"2028-11-09",latest:"16.16"},"17":{eol:"2029-11-08",latest:"17.12"},"18":{eol:"2030-11-14",latest:"18.7"}}},
  redis:{name:"Redis", eolKey:"redis", rec:"Upgrade to Redis 7.4 or 8.x", cycles:{
    "6.0":{eol:"2022-05-31"},"6.2":{eol:"2027-04-01",support:"2022-04-27"},"7.0":{eol:"2024-07-29"},"7.2":{eol:"2029-12-01",support:"2024-07-29"},
    "7.4":{eol:"2029-12-01",support:"2025-05-02"},"8.0":{eol:"2026-12-01",support:"2025-08-04"},"8.2":{eol:"2030-09-01"}}},
  vue:{name:"Vue", eolKey:"vue", rec:"Upgrade to Vue 3.5", cycles:{
    "2":{eol:"2023-12-31",latest:"2.7.16"},"3.0":{eol:"2021-06-07",minor:true},"3.1":{eol:"2021-08-09",minor:true},"3.2":{eol:"2023-05-11",latest:"3.2.47",minor:true},
    "3.3":{eol:"2023-12-29",minor:true},"3.4":{eol:"2024-09-03",minor:true},"3.5":{eol:null,latest:"3.5.45"},"3":{eol:null,latest:"3.5.45",note:"Minor not stated; confirm 3.5"}}},
  python:{name:"Python", eolKey:"python", rec:"Upgrade to Python 3.13 or 3.14", cycles:{
    "3.8":{eol:"2024-10-07"},"3.9":{eol:"2025-10-31"},"3.10":{eol:"2026-10-31"},"3.11":{eol:"2027-10-31"},"3.12":{eol:"2028-10-31"},
    "3.13":{eol:"2029-10-31"},"3.14":{eol:"2030-10-31"}}}
};

/* Known vulnerabilities (curated). ranges: affected if introduced <= v < fixed; noFix: affected major has no patched release */
export const CVES = [
  {id:"CVE-2025-66035", fixedDate:"2025-12-01", product:"angular", sev:"High", cvss:"7.7", title:"HttpClient sends the XSRF token to other domains when a request uses a protocol-relative URL (//host)",
   fixedBy:{"19":"19.2.16","20":"20.3.14","21":"21.0.1"}, noFixBelow:19, url:"https://osv.dev/vulnerability/CVE-2025-66035"},
  {id:"CVE-2026-88057", product:"angular", sev:"Medium", cvss:"5.3", title:"Host-binding sanitization bypass in @angular/core / @angular/compiler (XSS risk)",
   fixedBy:{"20":"20.3.31","21":"21.2.23","22":"22.1.6"}, noFixBelow:20, url:"https://www.herodevs.com/blog-posts/angular-cves-cve-2026-101895-cve-2026-88056-no-fix-angular-19"},
  {id:"CVE-2026-88056", product:"angular", sev:"High", cvss:"8.6", title:"SSRF and credential disclosure in Angular server-side rendering (SSR apps only)",
   fixedBy:{"20":"20.3.31","21":"21.2.23","22":"22.1.6"}, noFixBelow:20, ssrOnly:true, url:"https://www.herodevs.com/blog-posts/angular-cves-cve-2026-101895-cve-2026-88056-no-fix-angular-19"},
  {id:"CVE-2024-52301", fixedDate:"2024-11-12", product:"laravel", sev:"High", cvss:"8.7", title:"Environment manipulation through the query string when register_argc_argv is on",
   fixedBy:{"6":"6.20.45","7":"7.30.7","8":"8.83.28","9":"9.52.17","10":"10.48.23","11":"11.31.0"}, excludeLumen:true, url:"https://nvd.nist.gov/vuln/detail/CVE-2024-52301"},
  {id:"CVE-2025-55182", fixedDate:"2025-12-03", product:"nextjs", sev:"Critical", cvss:"10.0", title:"\"React2Shell\" remote code execution through React Server Components",
   fixedBy:{"15":"15.0.5|15.1.9|15.2.6|15.3.6|15.4.8|15.5.7","16":"16.0.7"}, url:"https://osv.dev/vulnerability/CVE-2025-55182"},
  {id:"CVE-2025-29927", fixedDate:"2025-03-21", product:"nextjs", sev:"Critical", cvss:"9.1", title:"Middleware authorization bypass with the x-middleware-subrequest header",
   fixedBy:{"12":"12.3.5","13":"13.5.9","14":"14.2.25","15":"15.2.3"}, url:"https://nvd.nist.gov/vuln/detail/CVE-2025-29927"},
  {id:"CVE-2024-9506", product:"vue", sev:"Low", cvss:"3.7", title:"ReDoS in the Vue 2 template compiler (parseHTML); Vue 2 will not be patched",
   fixedBy:{}, noFixBelow:3, url:"https://nvd.nist.gov/vuln/detail/CVE-2024-9506"},
  {id:"CVE-2025-1094", fixedDate:"2025-02-13", product:"postgresql", sev:"High", cvss:"8.1", title:"SQL injection through libpq quoting functions and psql",
   fixedBy:{"13":"13.19","14":"14.16","15":"15.11","16":"16.7","17":"17.3"}, noFixBelow:13, url:"https://nvd.nist.gov/vuln/detail/CVE-2025-1094"},
  {id:"CVE-2025-49844", fixedDate:"2025-10-03", product:"redis", sev:"Critical", cvss:"10.0", title:"\"RediShell\" use-after-free in the Lua engine allows remote code execution (needs an authenticated client)",
   fixedBy:{"6.2":"6.2.20","7.2":"7.2.11","7.4":"7.4.6","8.0":"8.0.4","8.2":"8.2.2"}, unfixedCycles:["6.0","7.0"], url:"https://nvd.nist.gov/vuln/detail/CVE-2025-49844"},
  {id:"CVE-2025-55315", fixedDate:"2025-10-14", product:"dotnet", sev:"Critical", cvss:"9.9", title:"ASP.NET Core Kestrel HTTP request smuggling (security feature bypass)",
   fixedBy:{"8":"8.0.21","9":"9.0.10"}, unfixedCycles:["2.1","3.1","5","6","7"], url:"https://nvd.nist.gov/vuln/detail/CVE-2025-55315"},
  {id:"CVE-2024-11236", fixedDate:"2024-11-21", product:"php", sev:"High", cvss:"9.8", title:"Integer overflow in the dblib/firebird PDO quoter; fixed only in supported PHP branches",
   fixedBy:{"8.1":"8.1.31","8.2":"8.2.26","8.3":"8.3.14"}, unfixedBelow:"8.1", url:"https://nvd.nist.gov/vuln/detail/CVE-2024-11236"},
  {id:"CVE-2025-1219", fixedDate:"2025-03-13", product:"php", sev:"Medium", cvss:"5.3", title:"libxml stream wrapper uses the wrong content-type after a redirect; fixed only in supported PHP branches",
   fixedBy:{"8.1":"8.1.32","8.2":"8.2.28","8.3":"8.3.19","8.4":"8.4.5"}, unfixedBelow:"8.1", url:"https://nvd.nist.gov/vuln/detail/CVE-2025-1219"},
  {id:"CVE-2026-21858", product:"n8n", sev:"Critical", cvss:"10.0", title:"\"Ni8mare\" unauthenticated file read and admin session forgery", fixedText:"1.121.0", url:"https://tray.ai/guides/n8n-security-tracker/"},
  {id:"CVE-2025-68613", product:"n8n", sev:"Critical", cvss:"9.9", title:"Expression injection leading to remote code execution (on CISA KEV list)", fixedText:"1.120.4", url:"https://tray.ai/guides/n8n-security-tracker/"},
  {id:"CVE-2026-27577", product:"n8n", sev:"Critical", cvss:"9.9", title:"Expression sandbox escape to remote code execution", fixedText:"1.123.22 / 2.9.3 / 2.10.1", url:"https://tray.ai/guides/n8n-security-tracker/"},
  {id:"CVE-2026-126383", product:"n8n", sev:"High", cvss:"8.2", title:"NoSQL injection in the MongoDB node (latest advisory batch, Nov 2026)", fixedText:"1.123.89 / 2.45.5 / 2.46.1 / 3.0.1", url:"https://tray.ai/guides/n8n-security-tracker/"}
];

/* Rules that are not version tables */
const SIMPLE = {
  java8:{name:"Java 8", sev:"Low", status:"Legacy", rec:"Plan a move to Java 21 LTS; Java 8 builds (e.g. Amazon Corretto 8) are patched by vendors until about 2030", note:"Language level from 2014"},
  kotlin:{name:"Kotlin"},
  android:{name:"Android SDK level"},
  ef6:{name:"Entity Framework 6 / ASP.NET MVC 5 / Web API 2", sev:"Low", status:"Legacy", rec:"Maintenance-only .NET Framework stack; migrate to ASP.NET Core on .NET 10"},
  lumen:{name:"Laravel Lumen", sev:"Medium", status:"Discontinued", rec:"Lumen is no longer recommended by Laravel and stopped at version 10; move to full Laravel 12/13"},
  n8n:{name:"n8n", sev:"High", status:"Verify version", rec:"Pin the n8n image to a patched release (1.123.89, 2.45.5, 2.46.1 or 3.0.1 or later). The repos use floating tags such as n8nio/n8n:stable / latest"},
  wordpress:{name:"WordPress", sev:"Info", status:"Verify version", rec:"Version not in the workbook; check core, theme and plugin versions (e.g. with WPScan)"},
  strapi:{name:"Strapi", sev:"Info", status:"Verify version", rec:"Version not in the workbook; confirm Strapi 5.x and a supported Node.js"},
  springboot:{name:"Spring Boot", sev:"Info", status:"Verify version", rec:"Version not in the workbook; Spring Boot 3.4+ needs Java 17+, so a Java 8 app is on Spring Boot 2.x (OSS support ended Nov 2023)"},
  martini:{name:"Lonti Martini runtime", sev:"Info", status:"Verify version", rec:"Check the vendor's latest runtime release and security notes"},
  nextjs:{name:"Next.js"},
  react:{name:"React"}
};


export const SEV_ORDER = ["Critical","High","Medium","Low","Info","OK"];
export const sevRank = s => { const i = SEV_ORDER.indexOf(s); return i < 0 ? 9 : i; };
export const worst = list => list.reduce((a,b) => sevRank(b) < sevRank(a) ? b : a, "OK");
export function vparse(v){ return String(v).split(/[.\-]/).map(x => parseInt(x,10)).map(n => isNaN(n) ? 0 : n); }
export function vcmp(a,b){ const A=vparse(a),B=vparse(b); for(let i=0;i<Math.max(A.length,B.length);i++){ const d=(A[i]||0)-(B[i]||0); if(d) return d<0?-1:1; } return 0; }
// The clock is replaceable so tests (and reports) can pin "today".
let clock = () => new Date();
export function setClock(fn) { clock = fn || (() => new Date()); }
function today(){ return clock(); }

const APP_HDR = /^(app(lication)?s?\s*(name)?|system(\s*name)?|product)$/i;
const USED_BY = /used\s*by\s*app/i;
const SKIP_COLS = /^(no\.?|#|id|review status)$/i;
export function findHeader(rows){
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const idx = r.findIndex(c => APP_HDR.test(String(c).trim()));
    const used = r.findIndex(c => USED_BY.test(String(c)));
    if (idx >= 0 || used >= 0) return { row: i, nameCol: idx, usedCol: used };
  }
  return null;
}
export function repoKey(x){ return String(x || "").trim().replace(/\.git$/i, "").replace(/\/(issues|pulls|tree|blob)(\/.*)?$/i, "").replace(/\/+$/, "").split("/").pop().toLowerCase(); }
export function reposFromText(v){
  // GitHub/Git URLs, "org/repo" pairs, or bare repo names on their own line
  const out = [];
  for (const m of String(v || "").matchAll(/(?:https?:\/\/)?(?:[\w.-]+\.\w+\/)?([\w.-]+\/[\w.-]+)(?:\/(?:issues|pulls|tree|blob)\S*)?/g)) {
    const full = m[0]; if (!/\//.test(full) || /^\d/.test(full)) continue;
    const name = repoKey(full.replace(/\/(issues|pulls|tree|blob)\S*$/i, ""));
    const disp = full.replace(/\/(issues|pulls|tree|blob)\S*$/i, "").replace(/\.git$/i, "").replace(/\/+$/, "").split("/").pop();
    if (name && !out.some(o => o.key === name)) out.push({ key: name, name: disp, url: /^https?:/.test(full) ? full.replace(/\/(issues|pulls|tree\/.*|blob\/.*)$/i, "") : (/github\.com/.test(full) ? "https://" + full : "") });
  }
  return out;
}
export function workbookToApps(sheets){
  const apps = new Map(); const extras = [];
  let primary = null;
  for (const sh of sheets) {
    const h = findHeader(sh.rows);
    if (h && h.nameCol >= 0 && !primary) primary = { sh, h };
    else if (h && h.usedCol >= 0) extras.push({ sh, h });
  }
  if (!primary) { // no headers: first column is the app name
    const sh = sheets[0];
    primary = { sh, h: { row: -1, nameCol: 0 }, headerless: true };
  }
  const { sh, h } = primary;
  const headers = h.row >= 0 ? sh.rows[h.row].map(x => String(x).trim()) : [];
  for (let i = h.row + 1; i < sh.rows.length; i++) {
    const r = sh.rows[i] || []; const name = String(r[h.nameCol] ?? "").trim();
    if (!name) continue;
    const fields = [];
    r.forEach((v, ci) => {
      if (ci === h.nameCol) return;
      const label = headers[ci] || (ci === 1 ? "Source / repository" : `Column ${ci+1}`);
      if (SKIP_COLS.test(label)) return;
      const val = String(v ?? "").trim();
      if (val) fields.push({ label, value: val });
    });
    const key = name.toLowerCase();
    if (apps.has(key)) apps.get(key).fields.push(...fields);
    else apps.set(key, { name, fields, units: [], unitSource: "" });
  }
  // Repository sheet(s): one audit unit per repository row
  for (const { sh: xs, h: xh } of extras) {
    const hdr = xs.rows[xh.row].map(x => String(x).trim());
    const urlCol = hdr.findIndex(x => /url|link/i.test(x));
    const nameCol = hdr.findIndex(x => /^repo(sitory)?(\s*name)?$/i.test(x));
    for (let i = xh.row + 1; i < xs.rows.length; i++) {
      const r = xs.rows[i] || []; const users = String(r[xh.usedCol] ?? "");
      const repo = String(r[nameCol >= 0 ? nameCol : 0] ?? "").trim(); if (!repo) continue;
      const url = urlCol >= 0 ? String(r[urlCol] ?? "").trim() : "";
      const rfields = []; r.forEach((v, ci) => { if (ci === xh.usedCol || ci === nameCol || ci === urlCol) return; const val = String(v ?? "").trim(); if (val) rfields.push({ label: hdr[ci] || `Column ${ci+1}`, value: val }); });
      for (const u of users.split(/,\s*/)) {
        const a = apps.get(u.trim().toLowerCase());
        const unreadable = rfields.some(f => /not accessible|404|not authori[sz]ed/i.test(f.value)) && rfields.every(f => !/\d+\.\d+/.test(f.value) || /not accessible|404/i.test(f.value));
        if (a && !a.units.some(x => repoKey(x.repo) === repoKey(repo))) { a.units.push({ repo, url, missing: unreadable, missingWhy: unreadable ? (rfields.find(f => /not accessible|404|not authori/i.test(f.value)) || {}).value : "", fields: rfields, text: rfields.map(f => `${f.label}: ${f.value}`).join("\n") }); a.unitSource = "sheet"; }
      }
    }
  }
  // Repositories named on the app row but missing from the repository sheet, or no repository sheet at all
  for (const a of apps.values()) {
    const repoField = a.fields.find(f => /repo|source|github|url/i.test(f.label));
    const listed = repoField ? reposFromText(repoField.value) : [];
    if (a.unitSource === "sheet") {
      for (const l of listed) if (!a.units.some(u => repoKey(u.repo) === l.key || repoKey(u.url) === l.key))
        a.units.push({ repo: l.name, url: l.url, fields: [], text: "", missing: true });
      continue;
    }
    if (listed.length >= 2) {
      // Split the app's columns by "repo-name: value" lines; lines without a prefix are shared only when they name no repo
      const units = listed.map(l => ({ repo: l.name, key: l.key, url: l.url, fields: [], lines: [] }));
      let anyPrefixed = false;
      for (const f of a.fields) {
        if (f === repoField) continue;
        for (const line of String(f.value).split(/\n/)) {
          const m = /^([\w.\-]+)\s*:\s*(.+)$/.exec(line.trim());
          const u = m && units.find(x => x.key === m[1].toLowerCase());
          if (u) { u.fields.push({ label: f.label, value: m[2] }); anyPrefixed = true; }
        }
      }
      if (anyPrefixed) {
        for (const f of a.fields) {
          if (f === repoField || /summary|pattern|category|note|status/i.test(f.label)) continue;
          if (String(f.value).split(/\n/).some(line => /^([\w.\-]+)\s*:/.test(line.trim()) && units.some(x => line.trim().toLowerCase().startsWith(x.key + ":")))) continue;
          units.forEach(u => u.fields.push({ label: f.label, value: f.value + " (shared)" }));
        }
        a.units = units.map(u => ({ repo: u.repo, url: u.url, fields: u.fields, text: u.fields.map(f => `${f.label}: ${f.value}`).join("\n") }));
        a.unitSource = "split";
      } else {
        a.units = [{ repo: listed.map(l => l.name).join(" + "), url: "", fields: a.fields, text: a.fields.map(f => `${f.label}: ${f.value}`).join("\n"), combined: true }];
        a.unitSource = "combined";
      }
    } else {
      a.units = [{ repo: listed[0] ? listed[0].name : "(whole application)", url: listed[0] ? listed[0].url : "", fields: a.fields, text: a.fields.map(f => `${f.label}: ${f.value}`).join("\n"), appLevel: true }];
      a.unitSource = "app";
    }
  }
  return { apps: [...apps.values()], primarySheet: sh.name, extraSheets: extras.map(e => e.sh.name), headerless: !!primary.headerless };
}


function lifecycleFinding(product, cycleKey, detected, version, ctx={}){
  const L = LIFECYCLE[product]; const c = L.cycles[cycleKey];
  const now = today();
  const f = { product, tech: L.name, cycle: cycleKey, detected, version, eol: null, support: null, latest: null, status: "Supported", severity: "OK", rec: "", note: "" };
  if (!c) {
    const known = Object.keys(L.cycles).sort(vcmp);
    if (known.length && vcmp(cycleKey, known[0]) < 0) { f.status = "End of life"; f.severity = "High"; f.rec = L.rec; f.note = "Older than every release still tracked"; }
    else { f.status = "Unknown version"; f.severity = "Info"; f.rec = "Check this version against the vendor's support policy"; }
    return f;
  }
  f.eol = c.eol; f.support = c.support || null; f.latest = c.latest || null; f.note = c.note || "";
  const eolD = c.eol ? new Date(c.eol + "T00:00:00Z") : null;
  if (eolD && eolD <= now) {
    f.status = "End of life"; const years = (now - eolD) / (365*DAY);
    const capHigh = DATASTORES.has(product) || c.minor; f.severity = (years >= 3 && !capHigh) ? "Critical" : "High"; f.rec = L.rec;
    f.note = (f.note ? f.note + ". " : "") + `No security fixes for ${years >= 1 ? Math.floor(years) + "+ year" + (years >= 2 ? "s" : "") : Math.max(1, Math.round((now - eolD)/DAY)) + " days"}`;
  } else if (eolD && (eolD - now) <= 90 * DAY) {
    f.status = "EOL soon"; f.severity = "Medium"; f.rec = L.rec; f.note = (f.note ? f.note + ". " : "") + `Security fixes stop in ${Math.ceil((eolD - now)/DAY)} days`;
  } else if (c.outdatedMinor) {
    f.status = "Outdated minor"; f.severity = "Low"; f.rec = `Update to ${L.name} ${c.latest}`;
  } else if (c.support && new Date(c.support + "T00:00:00Z") <= now) {
    f.status = "Security fixes only"; f.severity = "Low"; f.rec = L.rec;
  } else {
    f.status = "Supported"; f.severity = "OK"; f.rec = c.latest ? `Keep patched (latest ${c.latest})` : "Keep patched";
  }
  if (ctx.severityFloor && sevRank(ctx.severityFloor) < sevRank(f.severity)) f.severity = ctx.severityFloor;
  return f;
}

function cleanText(text){
  // Drop references to versions an app was migrated away from, e.g. "rebuilt from CakePHP 2.5", "(from CakePHP 3.10)"
  return text.replace(/\b(?:rebuilt from|rewrite of|rewritten from|migrated from|replacing|replaces|formerly|from)\s+[^;.\n)]*/gi, " ");
}
function dedupeTechs(list){
  const groups = new Map();
  for (const f of list) { const k = f.product + "|" + f.cycle; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  // drop a generic cycle ("Vue 3", "CakePHP 5") when a more specific one ("3.2", "5.2") was also found
  for (const k of [...groups.keys()]) { const [prod, cyc] = k.split("|"); if ([...groups.keys()].some(o => o !== k && o.startsWith(prod + "|" + cyc + "."))) groups.delete(k); }
  const out = [];
  for (const g of groups.values()) {
    const spec = f => String(f.version?.min || f.version?.raw || "").split(".").length + (f.version?.min ? 1 : 0);
    const best = Math.max(...g.map(spec)); const seenRaw = new Set();
    for (const f of g) { if (spec(f) !== best) continue; const r = f.detected; if (seenRaw.has(r)) continue; seenRaw.add(r); out.push(f); }
  }
  return out;
}
export function detect(text){
  text = cleanText(text);
  const found = []; const seen = new Set();
  const push = f => { const k = f.product + "|" + f.cycle + "|" + (f.version?.raw || ""); if (seen.has(k)) return; seen.add(k); found.push(f); };
  let m;
  // PHP
  const rePhp = /\bPHP\s*(?:\(\s*)?(?:>=\s*|>\s*=\s*)?(\d)\.(\d)(?:\.(\d+))?/gi;
  while ((m = rePhp.exec(text))) { const cyc = `${m[1]}.${m[2]}`; const raw = m[3] ? `${cyc}.${m[3]}` : cyc; push(lifecycleFinding("php", cyc, `PHP ${raw}`, { raw, exact: !!m[3], min: raw })); }
  // Angular (major, optional exact/range in parentheses)
  const reAng = /\bAngular\s+(\d{1,2})\b(?:\s*\(\s*([~^]?)(\d+\.\d+\.\d+)\s*\))?/g;
  while ((m = reAng.exec(text))) { const maj = m[1]; const raw = m[3] || null; const op = m[2] || ""; push(lifecycleFinding("angular", maj, `Angular ${raw ? op + raw : maj}`, { raw: raw || maj, exact: !!raw && !op, min: raw, op, major: maj })); }
  // Laravel / Lumen
  const reLar = /\bLaravel\s+(Lumen\s+)?(\d{1,2})\b/gi;
  while ((m = reLar.exec(text))) { const maj = m[2]; const lumen = !!m[1]; const f = lifecycleFinding("laravel", maj, `${lumen ? "Laravel Lumen" : "Laravel"} ${maj}`, { raw: maj, exact: false, major: maj, lumen }); if (lumen) f.tech = "Laravel Lumen (Laravel " + maj + " cycle)"; push(f); }
  if (/(?<!Laravel\/)\bLumen\b/i.test(text)) push(simpleFinding("lumen", "Laravel Lumen"));
  // .NET (Core / 5+)
  const reNet = /(?:ASP\.NET Core\s+(\d\.\d)|netcoreapp(\d\.\d)|\.NET\s+(?!Framework)(\d{1,2})(?:\.0)?\b)/gi;
  while ((m = reNet.exec(text))) { const v = m[1] || m[2] || m[3]; const cyc = (v === "2.1" || v === "3.1") ? v : String(parseInt(v,10)); push(lifecycleFinding("dotnet", cyc, `.NET ${v}`, { raw: v, exact: false, major: cyc })); }
  // .NET Framework
  const reFx = /\.NET Framework\s+v?(\d\.\d(?:\.\d)?)/gi;
  while ((m = reFx.exec(text))) { const v = m[1]; const cyc = LIFECYCLE.dotnetfx.cycles[v] ? v : v.split(".").slice(0,2).join("."); push(lifecycleFinding("dotnetfx", cyc, `.NET Framework ${v}`, { raw: v })); }
  // Node.js
  const reNode = /\b(?:Node(?:\.js)?\s+|node:)(\d{1,2})\b/gi;
  while ((m = reNode.exec(text))) push(lifecycleFinding("nodejs", m[1], `Node.js ${m[1]}`, { raw: m[1] }));
  // CakePHP
  const reCake = /\bCakePHP\s+(\d)(?:\.(\d+|x))?(?:\.(\d+))?/gi;
  while ((m = reCake.exec(text))) {
    const maj = m[1], min = m[2], pat = m[3];
    let cyc; if (maj === "1") cyc = "1.3"; else if (maj === "2" || maj === "3") cyc = maj; else cyc = (min && min !== "x") ? `${maj}.${min}` : maj;
    const raw = [maj, min, pat].filter(Boolean).join(".");
    push(lifecycleFinding("cakephp", cyc, `CakePHP ${raw}`, { raw }));
  }
  // MySQL
  const reMy = /\bMySQL\s+(\d+)(?:\.(\d+))?/gi;
  while ((m = reMy.exec(text))) { const cyc = m[2] !== undefined ? `${m[1]}.${m[2]}` : (m[1] === "8" ? "8.0" : m[1] === "5" ? "5.7" : `${m[1]}.0`); const f = lifecycleFinding("mysql", cyc, `MySQL ${m[2] !== undefined ? cyc : m[1]}`, { raw: cyc }); if (m[2] === undefined) f.note = (f.note ? f.note + ". " : "") + `"MySQL ${m[1]}" read as ${cyc}`; push(f); }
  // MariaDB
  const reMa = /\bMariaDB\s+(\d+\.\d+)/gi;
  while ((m = reMa.exec(text))) push(lifecycleFinding("mariadb", m[1], `MariaDB ${m[1]}`, { raw: m[1] }));
  // PostgreSQL
  const rePg = /\bPostgre(?:SQL|s)\s+(\d+)(?:\.(\d+))?/gi;
  while ((m = rePg.exec(text))) { const raw = m[2] ? `${m[1]}.${m[2]}` : m[1]; push(lifecycleFinding("postgresql", m[1], `PostgreSQL ${raw}`, { raw, exact: !!m[2], min: raw, major: m[1] })); }
  // Redis
  const reRe = /\bRedis\s+(\d)(?:\.(\d+))?/gi;
  while ((m = reRe.exec(text))) {
    let cyc = m[2] !== undefined ? `${m[1]}.${m[2]}` : (m[1] === "6" ? "6.2" : m[1] === "7" ? "7.4" : `${m[1]}.0`);
    const f = lifecycleFinding("redis", cyc, `Redis ${m[2] !== undefined ? cyc : m[1]}`, { raw: cyc, major: cyc });
    if (m[2] === undefined) f.note = (f.note ? f.note + ". " : "") + `Read as ${cyc} (the newest ${m[1]}.x image tag)`;
    push(f);
  }
  // Vue
  const reVue = /\bVue\s+(\d)(?:\.(\d+))?(?:\s*\(\s*([~^]?)(\d+\.\d+\.\d+))?/g;
  while ((m = reVue.exec(text))) {
    const maj = m[1]; const exact = m[4]; const minor = exact ? exact.split(".")[1] : m[2];
    const cyc = maj === "2" ? "2" : (minor !== undefined ? `3.${minor}` : "3");
    push(lifecycleFinding("vue", cyc, `Vue ${exact ? (m[3]||"") + exact : (m[2] !== undefined ? maj + "." + m[2] : maj)}`, { raw: exact || maj, exact: !!exact && !m[3], major: maj }));
  }
  // Python
  const rePy = /\bPython\s+(3\.\d{1,2})/g;
  while ((m = rePy.exec(text))) push(lifecycleFinding("python", m[1], `Python ${m[1]}`, { raw: m[1] }));
  // Java 8
  if (/\b(Java\s*8|JDK\s*8|Corretto\s*8)\b/i.test(text)) push(simpleFinding("java8", "Java 8"));
  // Kotlin
  const reKt = /\bKotlin\s+(\d)\.(\d+)/g;
  while ((m = reKt.exec(text))) {
    const v = `${m[1]}.${m[2]}`; const old = vcmp(v, "1.9") < 0;
    push({ product: "kotlin", tech: "Kotlin", cycle: v, detected: `Kotlin ${v}`, version: { raw: v }, status: old ? "Outdated" : "Supported", severity: old ? "Medium" : "OK",
      rec: old ? "Upgrade to Kotlin 2.x (current K2 compiler); 1.x toolchains block newer Android Gradle Plugin and SDK levels" : "Keep current", eol: null, latest: "2.x", note: old ? "Kotlin " + v + " dates from 2019 or earlier" : "" });
  }
  // Android SDK level
  const reSdk = /\b(?:compileSdk(?:Version)?|targetSdk(?:Version)?)\s*[:=]?\s*(\d{2})\b/gi;
  while ((m = reSdk.exec(text))) {
    const lvl = parseInt(m[1],10); let status, sev, rec, note;
    if (lvl < 35) { status = "Below Play requirement"; sev = "High"; rec = "Target API 36 (Android 16). Since 31 Aug 2026 Google Play requires API 36 for new apps and updates; below API 35 the app is hidden from newer devices"; note = "Old SDK levels also miss newer platform security protections"; }
    else if (lvl < 36) { status = "Below Play requirement for updates"; sev = "Medium"; rec = "Target API 36 to publish updates (required since 31 Aug 2026)"; note = ""; }
    else { status = "Supported"; sev = "OK"; rec = "Meets current Play requirement"; note = ""; }
    push({ product: "android", tech: "Android SDK level", cycle: String(lvl), detected: `API ${lvl}`, version: { raw: String(lvl) }, status, severity: sev, rec, eol: null, latest: "36", note });
  }
  // Next.js / React
  const reNext = /\bNext\.js\s+(\d{2})(?:\.(\d+)\.(\d+))?/g;
  while ((m = reNext.exec(text))) {
    const raw = m[2] ? `${m[1]}.${m[2]}.${m[3]}` : m[1];
    push({ product: "nextjs", tech: "Next.js", cycle: m[1], detected: `Next.js ${raw}`, version: { raw, exact: !!m[2], major: m[1] }, status: "Supported", severity: "OK", rec: "Keep on the latest 16.x patch", eol: null, latest: null, note: "" });
  }
  if (/\bNext\.js\b(?!\s+\d)/.test(text) && !found.some(f => f.product === "nextjs"))
    push({ product: "nextjs", tech: "Next.js", cycle: "?", detected: "Next.js (version not stated)", version: { raw: "?" }, status: "Verify version", severity: "Info", rec: "Confirm next >= 16.0.7 (or a patched 15.x) for React2Shell, CVE-2025-55182", eol: null, latest: null, note: "" });
  // EF6 / MVC 5 / Web API 2
  if (/Entity Framework 6|EF6|ASP\.NET MVC 5|Web API 2/i.test(text)) push(simpleFinding("ef6", "EF6 / MVC 5 / Web API 2"));
  if (/\bn8n\b(?!\s*workflows?\b|WorkFlow)/i.test(text)) push(simpleFinding("n8n", "n8n (floating image tag)"));
  if (/\bWordPress\b/i.test(text)) push(simpleFinding("wordpress", "WordPress"));
  if (/\bStrapi\b/i.test(text)) push(simpleFinding("strapi", "Strapi"));
  if (/\bSpring Boot\b/i.test(text)) push(simpleFinding("springboot", "Spring Boot"));
  const mm = /Martini runtime\s*(\d+\.\d+\.\d+)?/i.exec(text); if (mm) push(simpleFinding("martini", "Martini " + (mm[1] || "")));
  return dedupeTechs(found);
}
function simpleFinding(key, detected){
  const s = SIMPLE[key];
  return { product: key, tech: s.name, cycle: "-", detected, version: { raw: "" }, status: s.status, severity: s.sev, rec: s.rec, eol: null, latest: null, note: s.note || "" };
}

/* CVE matching for one finding */
export function matchCves(f){
  const out = [];
  for (const c of CVES) {
    if (c.product !== f.product) continue;
    if (c.excludeLumen && f.version && f.version.lumen) continue;
    let state = null, fixed = "";
    if (c.fixedText) { state = "Verify version"; fixed = c.fixedText; }
    else {
      const major = f.version?.major ?? f.cycle;
      const cyc = String(f.cycle);
      if (c.unfixedCycles && c.unfixedCycles.includes(cyc)) { state = "Affected (no fix for this version)"; fixed = "Upgrade required"; }
      else if (c.unfixedBelow && vcmp(cyc, c.unfixedBelow) < 0) { state = "Affected (no fix for this version)"; fixed = "Fixed only in " + Object.values(c.fixedBy).join(" / "); }
      else if (c.noFixBelow !== undefined && parseInt(major,10) < c.noFixBelow) { state = "Affected (no fix for this version)"; fixed = Object.values(c.fixedBy).join(" / ") || "No fix"; }
      else {
        const key = c.fixedBy[cyc] !== undefined ? cyc : (c.fixedBy[String(major)] !== undefined ? String(major) : null);
        if (key === null) continue;
        const fixList = c.fixedBy[key].split("|");
        fixed = fixList.join(" / ");
        const v = f.version?.min || f.version?.raw;
        const precise = v && /^\d+\.\d+\.\d+$/.test(v) || (f.product === "postgresql" && v && /^\d+\.\d+$/.test(v));
        if (precise) {
          const sameLine = fixList.filter(x => vparse(x)[0] === vparse(v)[0] && (fixList.length === 1 || vparse(x)[1] === vparse(v)[1]));
          const fx = sameLine[0] || fixList[fixList.length - 1];
          if (vcmp(v, fx) >= 0) continue; // patched
          state = f.version.exact ? "Affected" : "Possibly affected (declared range starts below fix)";
          fixed = fx;
        } else state = "Possibly affected (patch level not stated)";
      }
    }
    let sev = state.startsWith("Affected") ? c.sev : (sevRank(c.sev) < sevRank("Medium") ? SEV_ORDER[sevRank(c.sev)+1] : c.sev);
    if (state.startsWith("Possibly") && c.fixedDate && (today() - new Date(c.fixedDate + "T00:00:00Z")) > 270 * DAY) {
      sev = "Info"; state = `Check patch level (fix released ${new Date(c.fixedDate + "T00:00:00Z").toLocaleDateString(undefined,{month:"short",year:"numeric",timeZone:"UTC"})}; current images and lock files are usually past it)`;
    }
    out.push({ id: c.id, cvss: c.cvss, baseSev: c.sev, severity: sev, title: c.title + (c.ssrOnly ? " — applies only if the app uses SSR" : ""), state, fixed, url: c.url, tech: f.tech, detected: f.detected, source: "Built-in" });
  }
  return out;
}

export function auditUnit(text){
  const techs = detect(text);
  const vulns = []; for (const f of techs) vulns.push(...matchCves(f));
  const seen = new Set(); const uv = vulns.filter(v => { const k = v.id + "|" + v.detected; if (seen.has(k)) return false; seen.add(k); return true; });
  return { techs, vulns: uv };
}
function unitStats(u){
  const all = [...u.techs.filter(t => t.severity !== "OK").map(t => t.severity), ...u.vulns.map(v => v.severity)];
  u.risk = u.missing ? "Info" : (all.length ? worst(all) : "OK");
  u.eolCount = u.techs.filter(t => t.status === "End of life").length;
  u.soonCount = u.techs.filter(t => t.status === "EOL soon").length;
  u.affected = u.vulns.filter(v => v.state.startsWith("Affected")).length;
  u.possible = u.vulns.filter(v => !v.state.startsWith("Affected") && v.severity !== "Info").length;
  return u;
}
export function analyzeApp(app){
  const units = app.units.map(u => {
    const res = u.missing ? { techs: [], vulns: [] } : auditUnit(u.text);
    return unitStats({ ...u, ...res });
  });
  const audited = units.filter(u => !u.missing);
  const techs = audited.flatMap(u => u.techs.map(t => ({ ...t, repo: u.repo })));
  const vulns = audited.flatMap(u => u.vulns.map(v => ({ ...v, repo: u.repo })));
  const notAssessed = techs.length === 0 && (audited.length === 0 || audited.every(u => !String(u.text || "").trim()) || /not assessed|not accessible|no repository/i.test(app.fields.map(f => f.value).join(" ")));
  const risk = notAssessed ? "Info" : worst(audited.map(u => u.risk).concat("OK"));
  return { ...app, units, techs, vulns, risk, notAssessed,
    eolCount: units.reduce((s, u) => s + u.eolCount, 0), soonCount: units.reduce((s, u) => s + u.soonCount, 0),
    affected: units.reduce((s, u) => s + u.affected, 0), possible: units.reduce((s, u) => s + u.possible, 0) };
}

/** Merge endoflife.date rows (GET https://endoflife.date/api/<product>.json) into the built-in lifecycle table. */
export function applyEndOfLifeRows(key, rows) {
  const L = LIFECYCLE[key]; if (!L || !Array.isArray(rows)) return 0;
  const touched = new Set(); let n = 0;
  for (const row of rows) {
    let cyc = String(row.cycle);
    if (key === "cakephp") { const mj = cyc.split(".")[0]; if (mj === "1") cyc = "1.3"; else if (mj === "2" || mj === "3") cyc = mj; }
    if (key === "vue" && /^2\./.test(cyc)) cyc = "2";
    if (touched.has(cyc)) continue; touched.add(cyc);
    const cur = L.cycles[cyc] || (L.cycles[cyc] = {});
    if (typeof row.eol === "string") cur.eol = row.eol; else if (row.eol === false) cur.eol = null; else if (row.eol === true && !cur.eol) cur.eol = KB_AS_OF;
    if (typeof row.support === "string") cur.support = row.support;
    if (row.latest) cur.latest = row.latest;
    n++;
  }
  return n;
}

/** Packages that OSV.dev can check for an exact version. */
export const OSV_PACKAGES = { angular: ["npm", "@angular/core"], vue: ["npm", "vue"], nextjs: ["npm", "next"], cakephp: ["Packagist", "cakephp/cakephp"], laravel: ["Packagist", "laravel/framework"] };

/** Analyse every app of a workbook ([{ name, rows }]). */
export function analyzeWorkbook(sheets) {
  const parsed = workbookToApps(sheets);
  return { ...parsed, apps: parsed.apps.map(analyzeApp) };
}
