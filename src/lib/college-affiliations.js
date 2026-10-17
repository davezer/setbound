function normalizeCollegeName(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+university\s+of\s+/, '')
    .replace(/^university\s+of\s+/, '')
    .replace(/\buniversity\b/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Current FBS programs plus common source-facing variants used by Topps/Bowman.
// The registry is intentionally school-based rather than sport-based so the same
// Penn State affiliation can be reused for football, baseball, basketball, etc.
const SCHOOLS = [
  'Air Force','Akron','Alabama','Appalachian State','Arizona','Arizona State','Arkansas','Arkansas State','Army','Auburn',
  'Ball State','Baylor','Boise State','Boston College','Bowling Green','Buffalo','BYU',
  'California','Central Michigan','Charlotte','Cincinnati','Clemson','Coastal Carolina','Colorado','Colorado State',
  'Delaware','Duke','East Carolina','Eastern Michigan','FIU','Florida','Florida Atlantic','Florida State','Fresno State',
  'Georgia','Georgia Southern','Georgia State','Georgia Tech','Hawaii','Houston','Illinois','Indiana','Iowa','Iowa State',
  'Jacksonville State','James Madison','Kansas','Kansas State','Kennesaw State','Kent State','Kentucky','Liberty','Louisiana',
  'Louisiana Tech','Louisville','LSU','Marshall','Maryland','Memphis','Miami','Miami (OH)','Michigan','Michigan State',
  'Middle Tennessee','Minnesota','Mississippi State','Missouri','Missouri State','Navy','NC State','Nebraska','Nevada',
  'New Mexico','New Mexico State','North Carolina','North Texas','Northern Illinois','Northwestern','Notre Dame','Ohio','Ohio State',
  'Oklahoma','Oklahoma State','Old Dominion','Ole Miss','Oregon','Oregon State','Penn State','Pittsburgh','Purdue','Rice','Rutgers',
  'Sam Houston','San Diego State','San Jose State','SMU','South Alabama','South Carolina','South Florida','Southern Miss','Stanford',
  'Syracuse','TCU','Temple','Tennessee','Texas','Texas A&M','Texas State','Texas Tech','Toledo','Troy','Tulane','Tulsa','UAB','UCF',
  'UCLA','UConn','ULM','UMass','UNLV','USC','Utah','Utah State','UTEP','UTSA','Vanderbilt','Virginia','Virginia Tech',
  'Wake Forest','Washington','Washington State','West Virginia','Western Kentucky','Western Michigan','Wisconsin','Wyoming'
];

const ALIASES = new Map();
for (const school of SCHOOLS) ALIASES.set(normalizeCollegeName(school), school);

const extraAliases = {
  'cal': 'California',
  'california berkeley': 'California',
  'uc berkeley': 'California',
  'pitt': 'Pittsburgh',
  'pittsburgh': 'Pittsburgh',
  'uconn': 'UConn',
  'connecticut': 'UConn',
  'southern california': 'USC',
  'south carolina': 'South Carolina',
  'university of south carolina': 'South Carolina',
  'oklahoma': 'Oklahoma',
  'the university of oklahoma': 'Oklahoma',
  'texas a and m': 'Texas A&M',
  'texas a m': 'Texas A&M',
  'texas a and m university': 'Texas A&M',
  'texas a&m university': 'Texas A&M',
  'nc state': 'NC State',
  'north carolina state': 'NC State',
  'ole miss': 'Ole Miss',
  'mississippi': 'Ole Miss',
  'lsu': 'LSU',
  'louisiana state': 'LSU',
  'byu': 'BYU',
  'brigham young': 'BYU',
  'smu': 'SMU',
  'southern methodist': 'SMU',
  'tcu': 'TCU',
  'texas christian': 'TCU',
  'ucf': 'UCF',
  'central florida': 'UCF',
  'ucla': 'UCLA',
  'usc': 'USC',
  'unlv': 'UNLV',
  'utsa': 'UTSA',
  'utep': 'UTEP',
  'uab': 'UAB',
  'umass': 'UMass',
  'massachusetts': 'UMass',
  'ulm': 'ULM',
  'louisiana monroe': 'ULM',
  'fiu': 'FIU',
  'florida international': 'FIU',
  'florida atlantic': 'Florida Atlantic',
  'fau': 'Florida Atlantic',
  'miami fl': 'Miami',
  'miami florida': 'Miami',
  'miami hurricanes': 'Miami',
  'miami oh': 'Miami (OH)',
  'miami ohio': 'Miami (OH)',
  'miami university ohio': 'Miami (OH)',
  'app state': 'Appalachian State',
  'appalachian st': 'Appalachian State',
  'penn st': 'Penn State',
  'pennsylvania state': 'Penn State',
  'ohio st': 'Ohio State',
  'oklahoma st': 'Oklahoma State',
  'michigan st': 'Michigan State',
  'mississippi st': 'Mississippi State',
  'arizona st': 'Arizona State',
  'kansas st': 'Kansas State',
  'colorado st': 'Colorado State',
  'utah st': 'Utah State',
  'washington st': 'Washington State',
  'oregon st': 'Oregon State',
  'boise st': 'Boise State',
  'san jose st': 'San Jose State',
  'san diego st': 'San Diego State',
  'fresno st': 'Fresno State',
  'ball st': 'Ball State',
  'kent st': 'Kent State',
  'iowa st': 'Iowa State',
  'arkansas st': 'Arkansas State',
  'texas st': 'Texas State',
  'georgia st': 'Georgia State',
  'georgia southern': 'Georgia Southern',
  'middle tennessee state': 'Middle Tennessee',
  'mtsu': 'Middle Tennessee',
  'western kentucky university': 'Western Kentucky',
  'wku': 'Western Kentucky',
  'western michigan university': 'Western Michigan',
  'wmu': 'Western Michigan',
  'new mexico state': 'New Mexico State',
  'nmsu': 'New Mexico State',
  'sam houston state': 'Sam Houston',
  'sam houston state university': 'Sam Houston',
  'missouri st': 'Missouri State'
};

for (const [alias, canonical] of Object.entries(extraAliases)) {
  ALIASES.set(normalizeCollegeName(alias), canonical);
}

export function canonicalCollegeAffiliation(value = '') {
  return ALIASES.get(normalizeCollegeName(value)) || null;
}

export function isKnownCollegeAffiliation(value = '') {
  return Boolean(canonicalCollegeAffiliation(value));
}

export { normalizeCollegeName, SCHOOLS as COLLEGE_FOOTBALL_SCHOOLS };
