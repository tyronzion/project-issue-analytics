// Nationwide Philippine non-working days (regular holidays + special non-working days).
// These are skipped like weekends when counting business days. Local/city holidays and
// "special working days" (e.g. EDSA Anniversary) are not included.
//
// Sources: Proclamation No. 368 (2024), 727 (2025), 1006 (2026); Eid proclamations
// No. 579 (2024 Eid'l Adha), 839 / 911 (2025 Eid'l Fitr / Adha), 1189 / 1264 (2026 Eid'l Fitr / Adha);
// No. 878 (12 May 2025 elections), No. 729 (27 Jul 2025 INC anniversary).
//
// Add a new year here once Malacañang publishes it (usually Sept–Oct of the year before;
// Eid dates are proclaimed a week or two ahead). Extra dates can also go in HOLIDAYS in .env.local.
export const PH_HOLIDAYS = {
  2024: [
    '2024-01-01', // New Year's Day
    '2024-02-10', // Chinese New Year
    '2024-03-28', // Maundy Thursday
    '2024-03-29', // Good Friday
    '2024-03-30', // Black Saturday
    '2024-04-09', // Araw ng Kagitingan
    '2024-04-10', // Eid'l Fitr
    '2024-05-01', // Labor Day
    '2024-06-12', // Independence Day
    '2024-06-17', // Eid'l Adha
    '2024-08-21', // Ninoy Aquino Day
    '2024-08-26', // National Heroes Day
    '2024-11-01', // All Saints' Day
    '2024-11-02', // All Souls' Day
    '2024-11-30', // Bonifacio Day
    '2024-12-08', // Immaculate Conception
    '2024-12-24', // Christmas Eve
    '2024-12-25', // Christmas Day
    '2024-12-30', // Rizal Day
    '2024-12-31', // Last Day of the Year
  ],
  2025: [
    '2025-01-01', // New Year's Day
    '2025-01-29', // Chinese New Year
    '2025-04-01', // Eid'l Fitr
    '2025-04-09', // Araw ng Kagitingan
    '2025-04-17', // Maundy Thursday
    '2025-04-18', // Good Friday
    '2025-04-19', // Black Saturday
    '2025-05-01', // Labor Day
    '2025-05-12', // National and Local Elections
    '2025-06-06', // Eid'l Adha
    '2025-06-12', // Independence Day
    '2025-07-27', // Iglesia ni Cristo Founding Anniversary
    '2025-08-21', // Ninoy Aquino Day
    '2025-08-25', // National Heroes Day
    '2025-10-31', // All Saints' Day Eve
    '2025-11-01', // All Saints' Day
    '2025-11-30', // Bonifacio Day
    '2025-12-08', // Immaculate Conception
    '2025-12-24', // Christmas Eve
    '2025-12-25', // Christmas Day
    '2025-12-30', // Rizal Day
    '2025-12-31', // Last Day of the Year
  ],
  2026: [
    '2026-01-01', // New Year's Day
    '2026-02-17', // Chinese New Year
    '2026-03-20', // Eid'l Fitr
    '2026-04-02', // Maundy Thursday
    '2026-04-03', // Good Friday
    '2026-04-04', // Black Saturday
    '2026-04-09', // Araw ng Kagitingan
    '2026-05-01', // Labor Day
    '2026-05-27', // Eid'l Adha
    '2026-06-12', // Independence Day
    '2026-08-21', // Ninoy Aquino Day
    '2026-08-31', // National Heroes Day
    '2026-11-01', // All Saints' Day
    '2026-11-02', // All Souls' Day
    '2026-11-30', // Bonifacio Day
    '2026-12-08', // Immaculate Conception
    '2026-12-24', // Christmas Eve
    '2026-12-25', // Christmas Day
    '2026-12-30', // Rizal Day
    '2026-12-31', // Last Day of the Year
  ],
};

export const phHolidayList = () => Object.values(PH_HOLIDAYS).flat();
export const phHolidayYears = () => Object.keys(PH_HOLIDAYS).map(Number);
