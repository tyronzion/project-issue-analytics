// Synthetic tickets shaped like the UberTicket API, for `npm run demo`.

const APPS = [['Payroll App', '4.50'], ['Jobs', '3.109'], ['NEO', '1.20'], ['Timesheets', '2.8'], ['Client Portal', '5.3']];
const PEOPLE = ['ZionM', 'JaysonCo', 'NashNi'];
const SUBMITTERS = ['KarenR', 'PeterT', 'PatriciaV', 'MarkL'];

export function demoTickets(templates, now = Date.now()) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const iso = (t) => new Date(t).toISOString();
  const plain = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  const tickets = [];

  for (let i = 0; i < 140; i++) {
    const daysAgo = Math.floor(rnd() * 120);
    // Submitted during Manila business hours (00:00–09:00 UTC), on a weekday
    let created = now - daysAgo * 86_400_000;
    created = Math.floor(created / 86_400_000) * 86_400_000 + Math.floor(rnd() * 9 * 3_600_000);
    const dow = new Date(created).getUTCDay();
    if (dow === 0 || dow === 6) created -= (dow === 0 ? 2 : 1) * 86_400_000;
    if (created > now) created -= 86_400_000;

    const ackMin = rnd() < 0.88 ? 2 + rnd() * 50 : 60 + rnd() * 200;
    const assigned = created + ackMin * 60_000;
    const resHours = rnd() < 0.9 ? 1 + rnd() * 20 : 70 + rnd() * 90;
    const resolved = assigned + resHours * 3_600_000;
    const open = resolved > now || (daysAgo < 6 && rnd() < 0.35);
    const unassigned = open && rnd() < 0.2 && now - created < 3 * 3_600_000;
    const [app, major] = pick(APPS);
    const first = unassigned ? null : pick(PEOPLE);
    // ~25% get handed to someone else later, which moves assigned_at
    const reassign = first && rnd() < 0.25;
    const current = reassign ? PEOPLE.find((p) => p !== first) : first;
    const lastAssigned = reassign ? assigned + (20 + rnd() * 120) * 60_000 : assigned;
    const t = pick(templates);

    tickets.push({
      id: `demo-${i}`,
      serial: 3_890_000 - i * 37,
      template_id: t.id,
      template: { name: `Digital Product Security Assessment in ${t.env} Environment` },
      status: open ? (unassigned ? 'new' : 'on-going') : 'resolved',
      priority: 'low',
      is_overdue: false,
      created_at: iso(created),
      assigned_at: unassigned ? null : plain(lastAssigned),
      resolved_at: open ? null : plain(resolved),
      closed_at: open ? null : plain(resolved + 180_000),
      reopened_at: null,
      assignee: unassigned ? null : { alias: current },
      submitter: { alias: pick(SUBMITTERS) },
      tag: { ticket_label: [{ name: app }, { name: `${major}.${Math.floor(rnd() * 20)}` }] },
      endorsed: { serial: 3_890_000 - i * 37 - 5 },
    });
  }
  return tickets;
}

const PRODUCTS = ['Cloudstaff Mystaff', 'StaffCentral', 'Uberticket', 'Rewards', 'Nexus', 'Payroll App', 'Jobs', 'NEO', 'Timesheets', 'Client Portal', 'Tap Web', 'Cloudstaff Website'];
const FULL_PRIORITIES = ['low', 'normal', 'normal', 'high', 'critical'];
const FULL_SLA = { low: 5, normal: 10, high: 15, critical: 20 };

// Synthetic "Security Full Assessment" tickets (template 1080829), roughly every 4–8 months per product.
export function demoFullTickets(templateId, now = Date.now(), seedStart = 11) {
  let seed = seedStart;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const iso = (t) => new Date(t).toISOString();
  const plain = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  const mdY = (t) => { const d = new Date(t + 8 * 3_600_000); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`; };
  const weekday = (t) => { const dow = new Date(t).getUTCDay(); return dow === 6 ? t + 2 * 86_400_000 : dow === 0 ? t + 86_400_000 : t; };
  const tickets = [];
  let n = 0;

  PRODUCTS.forEach((product, pi) => {
    let occurrence = 1;
    // last assessment start: some products are overdue for their biannual retest
    let t = now - (pi % 4 === 3 ? 230 + rnd() * 120 : pi % 3 === 0 ? 1 + rnd() * 18 : 20 + rnd() * 150) * 86_400_000;
    while (t > now - 540 * 86_400_000) {
      const created = weekday(Math.floor(t / 86_400_000) * 86_400_000 + Math.floor(rnd() * 9 * 3_600_000));
      const priority = pick(FULL_PRIORITIES);
      const sla = FULL_SLA[priority];
      const days = rnd() < 0.82 ? sla * (0.3 + rnd() * 0.65) : sla * (1.05 + rnd() * 0.5);
      const resolved = created + days * 1.45 * 86_400_000; // calendar days incl. weekends
      const open = resolved > now;
      const endPlanned = created + sla * 1.4 * 86_400_000;
      const endLate = !open && rnd() < 0.15;
      const q = Math.floor(new Date(created).getUTCMonth() / 3) + 1;
      tickets.push({
        id: `demo-full-${n++}`,
        serial: 3_906_000 - n * 41,
        template_id: templateId,
        template: { name: 'Security Full Assessment' },
        status: open ? 'on-going' : 'resolved',
        priority,
        created_at: iso(created),
        assigned_at: plain(created + rnd() * 3_600_000),
        resolved_at: open ? null : plain(resolved),
        closed_at: open ? null : plain(resolved + 180_000),
        assignee: { alias: pick(['ZionM', 'JaysonCo', 'NashNi']) },
        submitter: { alias: pick(['JaysonCo', 'ZionM']) },
        data: {
          28968: '',
          28969: product,
          28970: `Q${q}`,
          28971: String(new Date(created).getUTCFullYear()),
          28972: mdY(created),
          28973: open && rnd() < 0.6 ? 'Invalid date' : mdY(endLate ? resolved - 3 * 86_400_000 : Math.max(endPlanned, resolved)),
          36034: '0',
        },
      });
      t -= (120 + rnd() * 120) * 86_400_000;
    }
  });
  // Occurrence counts up per product, oldest first
  const byProduct = {};
  for (const tk of [...tickets].sort((a, b) => a.created_at.localeCompare(b.created_at))) tk.data[36034] = String((byProduct[tk.data[28969]] = (byProduct[tk.data[28969]] || 0) + 1));
  return tickets;
}

// Synthetic "[PB-0933] Security Test - Rules of Engagement" tickets (template 72913), using that
// template's grouped data shape: data.public / data.private = { "field_<Label>": { id, label, type, value } }.
const ROE_PRODUCTS = ['Nexus V2', 'Quick Quote', 'StaffCentral', 'MyStaff Mobile', 'Rewards', 'Jobs Portal', 'Pact-X', 'NEO'];
export function demoRoeTickets(templateId, now = Date.now()) {
  const field = (id, label, type, value) => ({ id, label, has_been_deleted: false, type, value });
  return demoFullTickets(templateId, now, 23).filter((_, i) => i % 3 !== 2).map((t, i) => {
    const d = t.data;
    const product = ROE_PRODUCTS[PRODUCTS.indexOf(d[28969]) % ROE_PRODUCTS.length];
    return {
      ...t,
      id: `demo-roe-${i}`,
      template: { name: 'Security Test - Rules of Engagement' },
      data: {
        public: {
          'field_Product Name': field(19541, 'Product Name', 'text', product),
          field_Type: field(30741, 'Type', 'dropdown', i % 4 === 0 ? 'Mobile Application' : 'Web Application'),
          'field_Target Link': field(3864, 'Target Link', 'text', `https://${product.toLowerCase().replace(/\s+/g, '-')}.cloudstaff.com/`),
        },
        private: {
          'field_Start Date of Security Test': field(3866, 'Start Date of Security Test', 'date', d[28972]),
          'field_End Date of Security Test': field(3867, 'End Date of Security Test', 'date', d[28973]),
          'field_Time Spent (MM)': field(22570, 'Time Spent (MM)', 'number', String(300 + (i * 137) % 900)),
          field_Size: field(43044, 'Size', 'dropdown', ['Small', 'Medium', 'Large'][i % 3]),
        },
      },
    };
  });
}
