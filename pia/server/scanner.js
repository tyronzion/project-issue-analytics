// Repository scanner for the PIA module (DECISIONS D15). Pure and deterministic: paths and file text in, findings out.
// No network, no code execution. Repository content is untrusted text, read only with simple line-by-line regexes
// (no nested quantifiers, lines capped in length) so a hostile file can't make it hang.
//
// What it reports (never file contents; only paths, line numbers, identifier names and labels):
//   fields        personal / sensitive / credential identifiers found in schemas, migrations and models
//   storage       whether the repo has its own schema or migrations, which DB drivers/ORMs it uses, DB names in config
//   integrations  outside services it sends data to (from dependency manifests)
//   surface       whether it has a user interface or is an API only (from file paths)
//   hosts         hostnames in config / .env examples (selfHosts: the app's own URL settings); envKeys: setting names
//   controls      sign-in, roles, audit logging, consent/notice, retention/deletion, data export, anonymisation signals

export const RULESET_VERSION = '2026-10-30.1';

const MAX_LINE = 2000;

// ---- Which files are read -------------------------------------------------------------------------------------
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|\.next|coverage|\.git|bower_components|storage\/framework|public\/build)\//i;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|specs|fixtures?|__mocks__|stories|storybook|e2e|cypress)\/|\.(test|spec|stories)\.[a-z]+$/i;

const SCHEMA_PATTERNS = [
  /(^|\/)database\/migrations\/[^/]+\.php$/i,
  /(^|\/)db\/migrate\/[^/]+\.rb$/i,
  /(^|\/)db\/schema\.rb$/i,
  /(^|\/)schema\.prisma$/i,
  /\.sql$/i,
  /(^|\/)migrations?\/.+\.(sql|py|js|ts|mjs|cjs)$/i,
  /(^|\/)models\.py$/i,
  /(^|\/)models?\/[^/]+\.(js|ts|mjs|cjs|py|php|rb)$/i,
  /(^|\/)app\/Models\/[^/]+\.php$/,
  /\.entity\.(ts|js)$/i,
  /(^|\/)entities\/[^/]+\.(ts|js)$/i,
  /\.model\.(ts|js)$/i,
  /(^|\/)(db\/)?schema\.(ts|js)$/i,
];
const MANIFESTS = /(^|\/)(package\.json|composer\.json|requirements[^/]*\.txt|pyproject\.toml|Gemfile|go\.mod|pom\.xml|build\.gradle(\.kts)?|[^/]+\.csproj)$/i;
const CONFIG = /(^|\/)(\.env\.(example|sample|dist|template)|\.env\.[a-z]+\.example|docker-compose[^/]*\.ya?ml|config\/database\.(php|js|ts|yml)|config\/(app|services)\.php|settings\.py|application(-[a-z]+)?\.(ya?ml|properties)|appsettings(\.[A-Za-z]+)?\.json|wrangler\.toml|vercel\.json|netlify\.toml)$/i;

// 'schema' | 'manifest' | 'config' | null
export function fileKind(filePath) {
  const p = String(filePath || '');
  if (!p || SKIP_DIR.test(p) || TEST_PATH.test(p)) return null;
  if (MANIFESTS.test(p)) return p.split('/').length <= 3 ? 'manifest' : null; // root (or one-level app) manifests only
  if (CONFIG.test(p)) return 'config';
  if (SCHEMA_PATTERNS.some((re) => re.test(p))) return 'schema';
  return null;
}

// ---- Personal-data dictionary ---------------------------------------------------------------------------------
// Identifier -> category. Order matters (first match wins). sensitivity: 'sensitive' (PH Data Privacy Act sensitive
// personal information), 'personal', or 'credential' (secrets, reported separately, not personal data).
const tok = (words) => new RegExp(`(^|_)(${words})(_|$)`);
const RULES = [
  { category: 'Credential', sensitivity: 'credential', re: tok('password|passwd|password_hash|secret|api_key|apikey|access_token|refresh_token|remember_token|otp|totp|mfa_secret|private_key') },
  { category: 'Government ID', sensitivity: 'sensitive', re: tok('tin|tax_id|tax_number|tax_no|sss|sss_no|sss_number|philhealth|phil_health|pagibig|pag_ibig|hdmf|passport|passport_no|passport_number|national_id|umid|drivers_license|driver_license|license_number|prc|ssn|nric|abn|tfn') },
  { category: 'Health', sensitivity: 'sensitive', re: tok('health|medical|diagnosis|illness|disease|disability|vaccination|vaccine|vaccinated|allergy|allergies|blood_type|medication|prescription|pregnan[a-z]*|sick_leave') },
  { category: 'Financial', sensitivity: 'sensitive', re: tok('salary|salaries|wage|wages|compensation|payroll|pay_rate|hourly_rate|bank_account|account_number|account_no|iban|swift|routing_number|card_number|credit_card|cvv|cvc|bank_details|net_pay|gross_pay|bonus') },
  { category: 'Beliefs and origin', sensitivity: 'sensitive', re: tok('religion|religious|ethnicity|ethnic|race|political|party_affiliation|sexual_orientation|union_membership|tribe') },
  { category: 'Biometrics', sensitivity: 'sensitive', re: tok('biometric|biometrics|fingerprint|face_id|face_encoding|facial|retina|iris|voiceprint') },
  { category: 'Criminal record', sensitivity: 'sensitive', re: tok('criminal|conviction|nbi|nbi_clearance|police_clearance|offense|offence') },
  { category: 'Email', sensitivity: 'personal', re: tok('email|e_mail|email_address|personal_email|work_email') },
  { category: 'Phone', sensitivity: 'personal', re: tok('phone|mobile|telephone|tel|cellphone|contact_number|contact_no|mobile_number|phone_number|whatsapp|viber') },
  { category: 'Online identifier', sensitivity: 'personal', re: tok('ip|ip_address|ipaddress|user_agent|device_id|mac_address|cookie_id') },
  { category: 'Address', sensitivity: 'personal', re: tok('address|street|street_address|address_line[0-9]?|city|province|barangay|postcode|postal_code|zip|zipcode|home_address') },
  { category: 'Date of birth / age', sensitivity: 'personal', re: tok('dob|birth|birthday|birthdate|birth_date|date_of_birth|age') },
  { category: 'Gender / civil status', sensitivity: 'personal', re: tok('gender|sex|civil_status|marital_status|nationality|citizenship|spouse|dependents?|children') },
  { category: 'Photo / signature', sensitivity: 'personal', re: tok('photo|avatar|profile_picture|profile_photo|selfie|picture|signature|image_url|headshot') },
  { category: 'Location', sensitivity: 'personal', re: tok('location|latitude|longitude|lat|lng|geo|geolocation|gps|coordinates') },
  { category: 'Employee / customer ID', sensitivity: 'personal', re: tok('employee_id|employee_number|employee_no|staff_id|staff_number|emp_id|emp_no|customer_id|client_reference|member_id|badge_id') },
  { category: 'Emergency contact', sensitivity: 'personal', re: tok('emergency_contact|next_of_kin|kin|guardian') },
];
const PERSON_NAME = /^(first|last|middle|full|given|family|sur|maiden|nick|display|legal|preferred)_?name$|^(user|employee|staff|customer|contact|applicant|candidate|person|member|patient|owner|emergency_contact|spouse|guardian|recipient|sender|requester|assignee|reporter)_(full_)?name$|^surname$|^fullname$|^firstname$|^lastname$/;

// camelCase / kebab / spaces -> snake_case
export function normalizeIdentifier(id) {
  return String(id || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

// -> { category, sensitivity, confidence } or null
export function classifyIdentifier(id) {
  const n = normalizeIdentifier(id);
  if (!n || n.length > 64) return null;
  if (PERSON_NAME.test(n)) return { category: 'Name', sensitivity: 'personal', confidence: 'high' };
  if (n === 'name') return { category: 'Name', sensitivity: 'personal', confidence: 'low' };
  for (const r of RULES) if (r.re.test(n)) return { category: r.category, sensitivity: r.sensitivity, confidence: n.split('_').length <= 3 ? 'high' : 'medium' };
  return null;
}

// ---- Field extraction per framework -----------------------------------------------------------------------------
const COMMENT = /^\s*(\/\/|#|--|\*|\/\*)/;
const FIELD_RES = [
  ['laravel', /\$table->[a-zA-Z]+\(\s*['"]([A-Za-z_][A-Za-z0-9_]{0,63})['"]/g],
  ['rails', /\bt\.[a-z_]+\s+[:'"]([A-Za-z_][A-Za-z0-9_]{0,63})/g],
  ['rails', /\badd_column\s+:[a-z_]+,\s*:([A-Za-z_][A-Za-z0-9_]{0,63})/g],
  ['prisma', /^\s+([A-Za-z_][A-Za-z0-9_]{0,63})\s+(?:String|Int|DateTime|Boolean|Json|Float|Decimal|BigInt|Bytes)\b/g],
  ['sql', /^\s*[`"[]?([A-Za-z_][A-Za-z0-9_]{0,63})[`"\]]?\s+(?:varchar|nvarchar|char|text|tinytext|mediumtext|longtext|int|integer|bigint|smallint|tinyint|date|datetime|timestamp|timestamptz|boolean|bool|decimal|numeric|uuid|json|jsonb|blob|float|double|real|serial|bigserial|bytea|inet|enum)\b/gi],
  ['sql', /\badd\s+(?:column\s+)?[`"[]?([A-Za-z_][A-Za-z0-9_]{0,63})[`"\]]?\s+[a-z]/gi],
  ['django', /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*=\s*models\.[A-Za-z]+Field\(/g],
  ['sqlalchemy', /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*(?::\s*Mapped\[[^\]]{0,80}\]\s*)?=\s*(?:db\.)?(?:Column|mapped_column)\(/g],
  ['sequelize', /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*:\s*\{?\s*(?:type\s*:\s*)?(?:DataTypes|Sequelize)\.[A-Z]+/g],
  ['mongoose', /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*:\s*\{?\s*(?:type\s*:\s*)?(?:String|Number|Date|Boolean|Schema\.Types\.[A-Za-z]+)\b/g],
  ['drizzle', /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*:\s*(?:varchar|text|integer|serial|bigint|timestamp|boolean|date|json|jsonb|uuid|char|numeric|real)\(/g],
];
const TYPEORM_DECORATOR = /@(?:Column|PrimaryColumn|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\b/;
const TS_PROPERTY = /^\s*(?:public\s+|private\s+|readonly\s+)*([A-Za-z_][A-Za-z0-9_]{0,63})[?!]?\s*:/;
const SOFT_DELETES = /\$table->softDeletes\(|\bSoftDeletes\b|\bparanoid\s*:\s*true|deleted_at\b|acts_as_paranoid/;
const ENCRYPTED_CAST = /=>\s*['"]encrypted|EncryptedType|encrypt\(|Crypt::|createCipheriv|@Encrypted|attr_encrypted|encrypts\s+:/;

function extractFields(file) {
  const out = [];
  const lines = String(file.content || '').split('\n');
  let typeormNext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].length > MAX_LINE ? lines[i].slice(0, MAX_LINE) : lines[i];
    if (COMMENT.test(line)) continue;
    const found = new Set();
    if (typeormNext) {
      const m = TS_PROPERTY.exec(line);
      if (m) { found.add(`typeorm\u0000${m[1]}`); typeormNext = false; }
    }
    if (TYPEORM_DECORATOR.test(line)) {
      const rest = line.replace(/@\w+\([^)]{0,200}\)/, '');
      const m = TS_PROPERTY.exec(rest);
      if (m) found.add(`typeorm\u0000${m[1]}`);
      else typeormNext = true;
    }
    for (const [framework, re] of FIELD_RES) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) found.add(`${framework}\u0000${m[1]}`);
    }
    for (const f of found) {
      const [framework, identifier] = f.split('\u0000');
      out.push({ path: file.path, line: i + 1, framework, identifier });
    }
  }
  return out;
}

// ---- Manifests: dependencies -> storage drivers, integrations, controls ----------------------------------------
export function dependencies(file) {
  const p = file.path.toLowerCase();
  const text = String(file.content || '');
  const out = new Set();
  const add = (n) => n && n.length < 120 && out.add(n.toLowerCase());
  try {
    if (p.endsWith('package.json')) {
      const j = JSON.parse(text);
      Object.keys({ ...(j.dependencies || {}), ...(j.peerDependencies || {}) }).forEach(add);
      if (j.name) out.add(`\u0000name:${String(j.name).toLowerCase()}`);
    } else if (p.endsWith('composer.json')) {
      const j = JSON.parse(text);
      Object.keys(j.require || {}).forEach(add);
      if (j.name) out.add(`\u0000name:${String(j.name).toLowerCase()}`);
    } else if (/requirements[^/]*\.txt$/.test(p)) {
      for (const l of text.split('\n')) add(/^\s*([A-Za-z0-9_.-]+)/.exec(l)?.[1]);
    } else if (p.endsWith('pyproject.toml')) {
      for (const m of text.matchAll(/^\s*["']([A-Za-z0-9_.-]+)\s*[<>=~!;[\]"' ]/gm)) add(m[1]);
      for (const m of text.matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*["{]/gm)) add(m[1]);
    } else if (p.endsWith('gemfile')) {
      for (const m of text.matchAll(/^\s*gem\s+['"]([A-Za-z0-9_.-]+)['"]/gm)) add(m[1]);
    } else if (p.endsWith('go.mod')) {
      for (const m of text.matchAll(/^\s*([A-Za-z0-9_.\/-]+)\s+v\d/gm)) add(m[1]);
    } else if (p.endsWith('pom.xml')) {
      for (const m of text.matchAll(/<artifactId>([A-Za-z0-9_.-]{1,100})<\/artifactId>/g)) add(m[1]);
    } else if (/build\.gradle(\.kts)?$/.test(p)) {
      for (const m of text.matchAll(/['"]([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::[^'"]{0,40})?['"]/g)) add(m[2]);
    } else if (p.endsWith('.csproj')) {
      for (const m of text.matchAll(/PackageReference\s+Include="([A-Za-z0-9_.-]{1,100})"/g)) add(m[1]);
    }
  } catch {
    // malformed manifest: ignored
  }
  return [...out];
}

const DRIVERS = /^(mysql2?|pg|postgres|sqlite3|better-sqlite3|mongoose|mongodb|sequelize|typeorm|prisma|@prisma\/client|knex|drizzle-orm|objection|mikro-orm|@mikro-orm\/core|psycopg2(-binary)?|psycopg|sqlalchemy|flask-sqlalchemy|django|pymongo|peewee|doctrine\/(dbal|orm)|laravel\/framework|illuminate\/database|activerecord|rails|mysql-connector-java|postgresql|spring-boot-starter-data-jpa|entityframework|microsoft\.entityframeworkcore[a-z.]*|gorm\.io\/gorm|github\.com\/lib\/pq|github\.com\/go-sql-driver\/mysql|firebase-admin|@supabase\/supabase-js|mssql|tedious|oracledb|cassandra-driver|ioredis|redis)$/;
const CACHE_ONLY = /^(ioredis|redis)$/;

// [regex on dependency name, label, kind]
const INTEGRATIONS = [
  [/sendgrid/, 'SendGrid', 'Email'], [/^nodemailer$|swiftmailer|symfony\/mailer|phpmailer/, 'SMTP mail', 'Email'], [/mailgun/, 'Mailgun', 'Email'], [/postmark/, 'Postmark', 'Email'],
  [/mailchimp|mandrill/, 'Mailchimp', 'Email'], [/client-ses|aws-ses/, 'Amazon SES', 'Email'], [/resend/, 'Resend', 'Email'],
  [/client-s3|flysystem-aws-s3|aws-sdk|boto3|^aws\/aws-sdk-php$/, 'Amazon Web Services (S3 and others)', 'Cloud storage'],
  [/google-cloud\/storage|google\/cloud-storage|google-cloud-storage/, 'Google Cloud Storage', 'Cloud storage'], [/azure\/storage-blob|azure-storage/, 'Azure Storage', 'Cloud storage'],
  [/^firebase$|firebase-admin|firebase\//, 'Firebase', 'Cloud platform'], [/supabase/, 'Supabase', 'Cloud platform'], [/cloudinary/, 'Cloudinary', 'Cloud storage'],
  [/stripe/, 'Stripe', 'Payments'], [/paypal|braintree/, 'PayPal / Braintree', 'Payments'], [/xendit|paymongo|dragonpay/, 'PH payment gateway', 'Payments'],
  [/^openai$|openai-php|^@openai\//, 'OpenAI', 'AI'], [/@anthropic-ai\/sdk|^anthropic$/, 'Anthropic', 'AI'], [/@google\/genai|google-generativeai|@google\/generative-ai|google-genai/, 'Google Gemini', 'AI'], [/langchain/, 'LangChain', 'AI'],
  [/@sentry\/|sentry\/sentry|sentry-sdk|sentry-raven/, 'Sentry', 'Error monitoring'], [/newrelic/, 'New Relic', 'Monitoring'], [/dd-trace|datadog/, 'Datadog', 'Monitoring'], [/bugsnag/, 'Bugsnag', 'Error monitoring'], [/rollbar/, 'Rollbar', 'Error monitoring'],
  [/mixpanel/, 'Mixpanel', 'Analytics'], [/segment/, 'Segment', 'Analytics'], [/amplitude/, 'Amplitude', 'Analytics'], [/hotjar/, 'Hotjar', 'Analytics'], [/react-ga|gtag|google-analytics|analytics-node/, 'Google Analytics', 'Analytics'], [/posthog/, 'PostHog', 'Analytics'],
  [/twilio/, 'Twilio', 'SMS / voice'], [/vonage|nexmo/, 'Vonage', 'SMS / voice'], [/semaphore/, 'Semaphore SMS', 'SMS / voice'],
  [/@slack\/|slack-sdk|slack-notifier|laravel\/slack/, 'Slack', 'Messaging'], [/pusher/, 'Pusher', 'Messaging'], [/microsoft-graph|msgraph/, 'Microsoft Graph', 'Microsoft 365'],
  [/algolia/, 'Algolia', 'Search'], [/elasticsearch|@elastic\//, 'Elasticsearch', 'Search'],
  [/hubspot/, 'HubSpot', 'CRM'], [/jsforce|salesforce/, 'Salesforce', 'CRM'], [/intercom/, 'Intercom', 'Support'], [/zendesk/, 'Zendesk', 'Support'], [/freshdesk/, 'Freshdesk', 'Support'],
  [/googleapis|google-api-php-client|google-api-python-client/, 'Google APIs', 'Google Workspace'], [/docusign/, 'DocuSign', 'E-signature'], [/xero/, 'Xero', 'Accounting'], [/quickbooks|intuit/, 'QuickBooks', 'Accounting'],
];

// Control signals from dependencies: [regex, control, label]
const DEP_CONTROLS = [
  [/passport|next-auth|@auth\/|@azure\/msal|^msal|laravel\/(sanctum|socialite|fortify|breeze|jetstream|ui)|tymon\/jwt-auth|devise|omniauth|django-allauth|djangorestframework-simplejwt|^jsonwebtoken$|^jose$|auth0|keycloak|@okta\/|spring-boot-starter-security|spring-security|microsoft\.identity|flask-login|authlib|firebase\/auth/, 'auth', 'Sign-in library'],
  [/spatie\/laravel-permission|bouncer|@casl\/|^casl$|accesscontrol|cancancan|pundit|rolify|django-guardian|django-rules|casbin|zizaco\/entrust|santigarcor\/laratrust/, 'roles', 'Roles / permissions library'],
  [/laravel-activitylog|laravel-auditing|paper_trail|^audited$|django-auditlog|django-simple-history|sequelize-paper-trail|mongoose-audit|envers/, 'audit', 'Audit log library'],
  [/bcrypt|argon2|scrypt|passlib/, 'encryption', 'Password hashing'],
  [/laravel-model-cleanup|laravel-prunable|django-cleanup/, 'retention', 'Data clean-up library'],
  [/cookieconsent|cookie-consent|react-cookie-consent|vanilla-cookieconsent|laravel-cookie-consent|onetrust|cookiebot/, 'consent', 'Cookie consent'],
];

// Control signals from file paths (case-insensitive, on path segments)
const PATH_CONTROLS = [
  [/(^|[/_.-])(auth|login|logout|sso|oauth|saml|signin|sign-in)([/_.-]|$)/i, 'auth', 'Sign-in code'],
  [/(^|[/_.-])(roles?|permissions?|policies|acl|rbac|gates?)([/_.-]|$)/i, 'roles', 'Roles / permissions code'],
  [/(^|[/_.-])(audit|audits|activity[_-]?log|activitylog|audit[_-]?trail)([/_.-]|$)/i, 'audit', 'Audit logging code'],
  [/(^|[/_.-])(consent|consents|privacy|privacy[_-]?policy|cookie[_-]?(banner|consent|policy)|terms|terms[_-]?(of[_-]?)?(use|service)|gdpr|data[_-]?privacy|dpa)([/_.-]|$)/i, 'consent', 'Consent / privacy notice'],
  [/(^|[/_.-])(retention|purge|prune|prunable|cleanup|clean[_-]?up|delete[_-]?old|erase|erasure|forget[_-]?me|right[_-]?to[_-]?be[_-]?forgotten)([/_.-]|$)/i, 'retention', 'Retention / deletion code'],
  [/(^|[/_.-])(export[_-]?my[_-]?data|data[_-]?export|data[_-]?request|dsar|subject[_-]?access|download[_-]?my[_-]?data|personal[_-]?data[_-]?export)([/_.-]|$)/i, 'export', 'Personal data export / access request'],
  [/(^|[/_.-])(anonymi[sz]e|anonymi[sz]ation|anonymi[sz]er|pseudonymi[sz]e|masking|data[_-]?mask|redact|redaction)([/_.-]|$)/i, 'anonymisation', 'Anonymisation / masking code'],
  [/(^|[/_.-])(encrypt|encryption|crypto|cipher|kms|vault)([/_.-]|$)/i, 'encryption', 'Encryption code'],
];

// ---- UI vs API (from file paths only) ---------------------------------------------------------------------------
const UI_PATH = /(^|\/)(resources\/views\/|templates\/[^/]+\.html|src\/(pages|views|screens|components)\/|pages\/[^/]+\.(jsx?|tsx?|vue)|app\/[^/]+\/page\.(jsx?|tsx)|public\/index\.html|index\.html$|android\/app\/|ios\/[^/]+\.xcodeproj|lib\/main\.dart$)|\.(vue|svelte|blade\.php|erb|cshtml|razor|jsx|tsx)$/i;
const API_PATH = /(^|\/)(routes\/api\.php|app\/Http\/Controllers\/|controllers?\/|api\/|openapi\.(ya?ml|json)$|swagger\.(ya?ml|json)$|urls\.py$|views\.py$|serializers\.py$|routes?\/[^/]+\.(js|ts|py|rb|go)$|[^/]+\.controller\.(ts|js)$|handlers?\/)/i;

export function surfaceOf(paths) {
  let ui = 0, api = 0;
  const uiEvidence = [], apiEvidence = [];
  for (const p of paths) {
    if (SKIP_DIR.test(p) || TEST_PATH.test(p)) continue;
    if (UI_PATH.test(p)) { ui++; if (uiEvidence.length < 5) uiEvidence.push(p); }
    else if (API_PATH.test(p)) { api++; if (apiEvidence.length < 5) apiEvidence.push(p); }
  }
  const type = ui >= 2 ? (api ? 'web app with API' : 'web app') : api ? 'api' : 'other';
  return { type, ui, api, uiEvidence, apiEvidence };
}

// ---- Config: DB names, hosts, setting names -------------------------------------------------------------------
const DB_NAME_LINES = [
  /^\s*(?:DB_DATABASE|DB_NAME|DATABASE_NAME|POSTGRES_DB|MYSQL_DATABASE|MONGO_DB|MONGODB_DB|MONGO_INITDB_DATABASE|PGDATABASE)\s*[:=]\s*["']?([A-Za-z0-9_-]{2,64})/,
  /^\s*(?:DATABASE_URL|DB_URL|MONGO_URL|MONGODB_URI|MONGO_URI|DB_CONNECTION_STRING|SQLALCHEMY_DATABASE_URI)\s*[:=]\s*["']?[a-z+]{2,20}:\/\/[^/\s"']{0,200}\/([A-Za-z0-9_-]{2,64})/,
  /['"]database['"]\s*=>\s*env\(\s*['"]DB_DATABASE['"]\s*,\s*['"]([A-Za-z0-9_-]{2,64})['"]/,
];
const PLACEHOLDER_DB = /^(laravel|database|db|test|testing|your_?database|your_?db|postgres|mysql|homestead|forge|example|dbname|db_name|app|myapp|my_app|mydb|root|admin|sample|default|changeme|xxx+|local|dev|development)$/i;
const SELF_URL_KEYS = /^\s*(APP_URL|APP_DOMAIN|SERVER_NAME|BASE_URL|SITE_URL|PUBLIC_URL|APP_HOST|HOST_URL|SANCTUM_STATEFUL_DOMAINS|SESSION_DOMAIN)\s*[:=]\s*["']?([^\s"']{1,300})/;
const HOST_RE = /\bhttps?:\/\/([a-z0-9][a-z0-9.-]{0,200}\.[a-z]{2,24})\b/gi;
const IGNORE_HOST = /(^|\.)(localhost|example\.(com|org|net)|test|local|invalid|github\.com|githubusercontent\.com|npmjs\.(org|com)|w3\.org|schema\.org|json-schema\.org|googleapis\.com|gstatic\.com|cloudflare\.com|jsdelivr\.net|unpkg\.com|packagist\.org|pypi\.org|docker\.(io|com)|apache\.org|mozilla\.org|php\.net|laravel\.com|mysql\.com|postgresql\.org)$/i;
const ENV_KEY = /^\s*([A-Z][A-Z0-9_]{2,80})\s*=/;

const hostOf = (v) => {
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase();
  } catch {
    return null;
  }
};

function readConfig(file, acc) {
  const lines = String(file.content || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].length > MAX_LINE ? lines[i].slice(0, MAX_LINE) : lines[i];
    if (/^\s*#/.test(line) && !/\.env/.test(file.path)) continue;
    for (const re of DB_NAME_LINES) {
      const m = re.exec(line);
      if (m && !PLACEHOLDER_DB.test(m[1])) acc.databases.add(m[1].toLowerCase());
    }
    const self = SELF_URL_KEYS.exec(line);
    if (self) for (const part of self[2].split(',')) { const h = hostOf(part.trim()); if (h && !IGNORE_HOST.test(h)) acc.selfHosts.add(h); }
    for (const m of line.matchAll(HOST_RE)) { const h = m[1].toLowerCase(); if (!IGNORE_HOST.test(h)) acc.hosts.add(h); }
    const k = ENV_KEY.exec(line);
    if (k && /\.env|docker-compose/i.test(file.path)) acc.envKeys.add(k[1]);
  }
}

// ---- Main entry ------------------------------------------------------------------------------------------------
// paths: every file path in the repo tree (for UI/API and path signals); files: [{ path, content }] that were read.
export function scanFiles({ paths = [], files = [] }) {
  const fields = [];
  const deps = new Set();
  const names = new Set();
  const acc = { databases: new Set(), hosts: new Set(), selfHosts: new Set(), envKeys: new Set() };
  const controls = {};
  const addControl = (kind, label, where) => {
    const list = (controls[kind] ||= []);
    if (list.length < 10 && !list.some((c) => c.label === label && c.path === where.path)) list.push({ label, ...where });
  };
  let schemaFiles = 0;
  let softDeletes = false;

  for (const file of files) {
    const kind = fileKind(file.path);
    if (kind === 'schema') {
      schemaFiles++;
      const text = String(file.content || '');
      if (SOFT_DELETES.test(text)) { softDeletes = true; addControl('retention', 'Soft deletes', { path: file.path }); }
      if (ENCRYPTED_CAST.test(text)) addControl('encryption', 'Encrypted fields', { path: file.path });
      for (const f of extractFields(file)) {
        const c = classifyIdentifier(f.identifier);
        if (c) fields.push({ ...f, ...c });
      }
    } else if (kind === 'manifest') {
      for (const d of dependencies(file)) d.startsWith('\u0000name:') ? names.add(d.slice(6)) : deps.add(d);
    } else if (kind === 'config') {
      readConfig(file, acc);
    }
  }

  for (const p of paths) {
    if (SKIP_DIR.test(p) || TEST_PATH.test(p)) continue;
    for (const [re, kind, label] of PATH_CONTROLS) if (re.test(p)) addControl(kind, label, { path: p });
  }
  const integrations = [];
  for (const d of deps) {
    for (const [re, label, kind] of INTEGRATIONS) if (re.test(d) && !integrations.some((x) => x.label === label)) integrations.push({ label, kind, dependency: d });
    for (const [re, kind, label] of DEP_CONTROLS) if (re.test(d)) addControl(kind, label, { dependency: d });
  }
  const drivers = [...deps].filter((d) => DRIVERS.test(d));
  const dedup = new Map();
  for (const f of fields) {
    const k = `${f.path}:${f.line}:${f.identifier}`;
    if (!dedup.has(k)) dedup.set(k, f);
  }
  return {
    rulesetVersion: RULESET_VERSION,
    fields: [...dedup.values()],
    storage: {
      ownSchema: schemaFiles > 0,
      schemaFiles,
      drivers,
      persistent: drivers.some((d) => !CACHE_ONLY.test(d)) || schemaFiles > 0,
      databases: [...acc.databases],
      softDeletes,
    },
    integrations,
    surface: surfaceOf(paths),
    hosts: [...acc.hosts].slice(0, 100),
    selfHosts: [...acc.selfHosts].slice(0, 20),
    envKeys: [...acc.envKeys].slice(0, 300),
    packageNames: [...names],
    dependencies: [...deps].slice(0, 400),
    controls,
  };
}

// Personal-data summary of a scan: categories and counts (credentials are not personal data).
export function personalSummary(fields) {
  const byCat = new Map();
  for (const f of fields) {
    if (f.sensitivity === 'credential') continue;
    const e = byCat.get(f.category) || { category: f.category, sensitivity: f.sensitivity, count: 0, identifiers: new Set() };
    e.count++;
    e.identifiers.add(f.identifier);
    byCat.set(f.category, e);
  }
  return [...byCat.values()].map((e) => ({ ...e, identifiers: [...e.identifiers].slice(0, 12) }))
    .sort((a, b) => (a.sensitivity === b.sensitivity ? b.count - a.count : a.sensitivity === 'sensitive' ? -1 : 1));
}
