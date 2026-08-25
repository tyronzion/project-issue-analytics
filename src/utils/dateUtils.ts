export function parseDateToISO(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Check if it's an Excel serial date (e.g. 45000 is ~2023)
    if (val > 20000 && val < 60000) {
      // Excel base date is 1899-12-30
      const utcDays = Math.floor(val - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      if (!isNaN(dateInfo.getTime())) {
        return dateInfo.toISOString().split('T')[0];
      }
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  const str = String(val).trim();
  if (!str) return '';

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Handle Jira format e.g. "15/Aug/24 10:30 AM" or "15/Aug/2024" or "15-Aug-2024"
  const jiraMatch = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,9})[\/\-\s](\d{2,4})/);
  if (jiraMatch) {
    const day = parseInt(jiraMatch[1], 10);
    const monthStr = jiraMatch[2].toLowerCase();
    let year = parseInt(jiraMatch[3], 10);
    if (year < 100) year += 2000;

    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const prefix = monthStr.substring(0, 3);
    if (months[prefix] !== undefined) {
      const d = new Date(Date.UTC(year, months[prefix], day));
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
  }

  // Handle standard slash/dash dates MM/DD/YYYY or DD/MM/YYYY or YYYY/MM/DD
  const slashMatch = str.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})/);
  if (slashMatch) {
    let p1 = parseInt(slashMatch[1], 10);
    let p2 = parseInt(slashMatch[2], 10);
    let p3 = parseInt(slashMatch[3], 10);

    if (p1 > 1000) {
      // YYYY-MM-DD
      const d = new Date(Date.UTC(p1, p2 - 1, p3));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } else if (p3 > 1000) {
      // MM/DD/YYYY or DD/MM/YYYY. Default assume MM/DD/YYYY unless p1 > 12
      let m = p1;
      let day = p2;
      if (p1 > 12 && p2 <= 12) {
        day = p1;
        m = p2;
      }
      const d = new Date(Date.UTC(p3, m - 1, day));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  // Native parse fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

export function isDateInRange(dateStr: string, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  const iso = dateStr.length === 10 ? dateStr : parseDateToISO(dateStr);
  if (!iso) return false;

  if (startDate && iso < startDate) return false;
  if (endDate && iso > endDate) return false;
  return true;
}

export function getPresetDateRange(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const format = (d: Date) => d.toISOString().split('T')[0];
  const todayStr = format(now);

  switch (preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      return { startDate: format(monday), endDate: todayStr };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: format(firstDay), endDate: todayStr };
    }
    case 'last_7_days': {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: format(past), endDate: todayStr };
    }
    case 'last_30_days': {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: format(past), endDate: todayStr };
    }
    case 'last_90_days': {
      const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { startDate: format(past), endDate: todayStr };
    }
    case 'this_year': {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      return { startDate: format(firstDay), endDate: todayStr };
    }
    case 'all':
    default:
      return { startDate: '', endDate: '' };
  }
}
