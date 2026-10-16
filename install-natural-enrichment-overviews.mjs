import fs from 'node:fs';

const path = 'src/lib/server/checklist-insider-enrichment.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const start = source.indexOf('function makeOverview(title, releaseDate, formats, sourceFacts) {');
const end = source.indexOf('\nfunction canonicalImageKey', start);

if (start < 0 || end < 0) {
	throw new Error('Could not locate makeOverview().');
}

const replacement = `function overviewSport(title = '') {
\tif (/\\bbaseball\\b/i.test(title)) return 'baseball';
\tif (/\\bfootball\\b/i.test(title)) return 'football';
\tif (/\\bbasketball\\b/i.test(title)) return 'basketball';
\tif (/\\bsoccer\\b/i.test(title)) return 'soccer';
\tif (/\\bhockey\\b/i.test(title)) return 'hockey';
\tif (/\\bwrestling|wwe|aew\\b/i.test(title)) return 'wrestling';
\tif (/\\bformula 1|racing|nascar\\b/i.test(title)) return 'racing';
\tif (/\\bgolf\\b/i.test(title)) return 'golf';
\tif (/\\btennis\\b/i.test(title)) return 'tennis';
\treturn 'trading card';
}

function hasAutographGuarantee(details = '') {
\treturn /(?:\\b\\d+\\s+autographs?\\b|\\bone\\s+autograph\\b|\\btwo\\s+autographs?\\b|\\bthree\\s+autographs?\\b|\\bfour\\s+autographs?\\b|\\bautographs?\\s+per\\s+box\\b|\\bguaranteed\\s+autographs?\\b)/i.test(
\t\tString(details || '')
\t);
}

function collectorFacingOverview(value = '') {
\treturn String(value || '')
\t\t// Collector-facing copy should never expose where Setbound gathered facts.
\t\t.replace(/\\bChecklist Insider\\b/gi, '')
\t\t.replace(/\\baccording to\\s+(?:the\\s+)?(?:source|article|checklist)\\b/gi, '')
\t\t.replace(/\\b(?:the\\s+)?source\\s+(?:lists|says|notes|reports|shows)\\b/gi, '')
\t\t.replace(/\\s+([,.;:!?])/g, '$1')
\t\t.replace(/\\s{2,}/g, ' ')
\t\t.trim();
}

function makeOverview(title, releaseDate, formats, sourceFacts) {
\tconst sentences = [];
\tconst themes = factualThemes(sourceFacts);
\tconst sport = overviewSport(title);
\tconst factsText = sourceFacts.join(' ');

\tlet dateText = '';
\tif (releaseDate) {
\t\tdateText = new Date(\`\${releaseDate}T12:00:00Z\`).toLocaleDateString('en-US', {
\t\t\tmonth: 'long',
\t\t\tday: 'numeric',
\t\t\tyear: 'numeric',
\t\t\ttimeZone: 'UTC'
\t\t});
\t}

\tif (title) {
\t\tif (dateText && themes.length) {
\t\t\tsentences.push(
\t\t\t\t\`\${title} released on \${dateText} with a \${sport} checklist built around \${humanList(themes.slice(0, 4))}.\`
\t\t\t);
\t\t} else if (dateText) {
\t\t\tsentences.push(\`\${title} released on \${dateText}.\`);
\t\t} else if (themes.length) {
\t\t\tsentences.push(
\t\t\t\t\`\${title} features a \${sport} checklist built around \${humanList(themes.slice(0, 4))}.\`
\t\t\t);
\t\t} else {
\t\t\tsentences.push(\`\${title} is a \${sport} card release with a mix of base cards, inserts, and chase content.\`);
\t\t}
\t}

\tif (/chromium|chrome/i.test(factsText) && /paper/i.test(factsText)) {
\t\tsentences.push('The release mixes traditional paper cards with Chrome-style content.');
\t} else if (/sapphire/i.test(\`\${title} \${factsText}\`)) {
\t\tsentences.push('Sapphire styling and exclusive color parallels give the release its distinct look.');
\t}

\tconst names = formatNames(formats);

\tif (names.length) {
\t\tsentences.push(
\t\t\t\`Collectors can find the product in \${humanList(names.slice(0, 5))} configurations.\`
\t\t);
\t}

\tconst guaranteedAutographFormats = formats
\t\t.filter((format) => hasAutographGuarantee(format.details))
\t\t.map((format) => normalizeFormatName(format.sourceLabel))
\t\t.filter(Boolean);

\tif (guaranteedAutographFormats.length) {
\t\tsentences.push(
\t\t\t\`Autograph guarantees are included in \${humanList(guaranteedAutographFormats.slice(0, 4))} boxes.\`
\t\t);
\t} else if (/autograph/i.test(factsText)) {
\t\tsentences.push('Autographs are part of the chase alongside the product’s other inserts and parallels.');
\t}

\treturn collectorFacingOverview(sentences.slice(0, 4).join(' '));
}
`;

source = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(path, source);
console.log('Natural collector-facing enrichment overviews installed.');
