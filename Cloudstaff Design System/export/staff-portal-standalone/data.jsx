(function(){
/* Staff Portal — shared mock data + tiny helpers. Registers globals. */
const CSDS = window.CloudstaffDesignSystem_e09b25;

const TEAM = [
  { initials: "JC", name: "Janet Cruz", role: "Senior Frontend Engineer", status: "Available", location: "Manila, PH", rating: "4.9", rate: 24 },
  { initials: "MR", name: "Marco Reyes", role: "DevOps Lead", status: "Busy", location: "Cebu, PH", rating: "4.8", rate: 32 },
  { initials: "DM", name: "Diane Mendez", role: "QA Analyst", status: "Available", location: "Davao, PH", rating: "4.7", rate: 19 },
  { initials: "PT", name: "Paolo Tan", role: "Backend Engineer", status: "Available", location: "Manila, PH", rating: "4.9", rate: 27 },
];

const TIMESHEETS = [
  { id: 1, initials: "JC", name: "Janet Cruz", period: "Wk 17 · Apr 21–27", hours: "38.5", status: "Pending", variant: "warning" },
  { id: 2, initials: "MR", name: "Marco Reyes", period: "Wk 17 · Apr 21–27", hours: "40.0", status: "Approved", variant: "success" },
  { id: 3, initials: "DM", name: "Diane Mendez", period: "Wk 17 · Apr 21–27", hours: "32.0", status: "Returned", variant: "danger" },
  { id: 4, initials: "PT", name: "Paolo Tan", period: "Wk 17 · Apr 21–27", hours: "40.0", status: "In progress", variant: "info" },
  { id: 5, initials: "AL", name: "Anna Lim", period: "Wk 17 · Apr 21–27", hours: "37.0", status: "Pending", variant: "warning" },
];

function Logo({ reversed = false, width = 150 }) {
  const src = reversed ? window.__resources.logoLandscapeReversed : window.__resources.logoLandscape;
  return <img src={src} width={width} alt="Cloudstaff" style={{ display: "block" }} />;
}

Object.assign(window, { CSDS, TEAM, TIMESHEETS, Logo });

})();
