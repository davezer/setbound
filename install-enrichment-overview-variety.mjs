import fs from 'node:fs';

const path = 'src/lib/server/checklist-insider-enrichment.js';

if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);

let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('function makeOverview(title, releaseDate, formats, sourceFacts) {');
const end = source.indexOf('\nfunction canonicalImageKey', start);
if (start < 0 || end < 0) throw new Error('Could not locate makeOverview() block.');

const replacement = String.raw`function overviewSeed(value = '') {
\tlet hash = 2166136261;
\tfor (const char of String(value || '')) {
\t\thash ^= char.charCodeAt(0);
\t\thash = Math.imul(hash, 16777619);
\t}
\treturn Math.abs(hash >>> 0);
}

function chooseOverview(options, seed, offset = 0) {
\tif (!options.length) return '';
\treturn options[(seed + offset) % options.length];
}

function overviewDateText(releaseDate) {
\tif (!releaseDate) return '';
\treturn new Date(\`${releaseDate}T12:00:00Z\`).toLocaleDateString('en-US', {
\t\tmonth: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
\t});
}

function overviewSubjectPhrase(signals) {
\tconst groups = [];
\tif (signals.prospects) groups.push('prospects');
\tif (signals.rookies) groups.push('rookies');
\tif (signals.veterans) groups.push('veterans and established stars');
\treturn groups;
}

function overviewContentPhrase(signals) {
\tconst groups = [];
\tif (signals.inserts) groups.push('inserts');
\tif (signals.parallels) groups.push('parallels');
\tif (signals.autographs) groups.push('autographs');
\tif (signals.memorabilia) groups.push('memorabilia cards');
\treturn groups;
}

function makeOverview(title, releaseDate, formats, sourceFacts) {
\tconst product = cleanOverviewTitle(title);
\tconst signals = overviewSignals(sourceFacts);
\tconst seed = overviewSeed(product);
\tconst subjects = overviewSubjectPhrase(signals);
\tconst content = overviewContentPhrase(signals);
\tconst dateText = overviewDateText(releaseDate);
\tconst sentences = [];
\tconst openings = [];

\tif (subjects.length && content.length) {
\t\topenings.push(
\t\t\t\`${product} combines ${humanList(subjects.slice(0, 3))} with ${humanList(content.slice(0, 3))} across the release.\`,
\t\t\t\`${product} gives collectors a checklist featuring ${humanList(subjects.slice(0, 3))}, backed by ${humanList(content.slice(0, 3))}.\`,
\t\t\t\`The ${product} checklist mixes ${humanList(subjects.slice(0, 3))} with a strong selection of ${humanList(content.slice(0, 3))}.\`,
\t\t\t\`${product} balances set-building around ${humanList(subjects.slice(0, 3))} with chase content that includes ${humanList(content.slice(0, 3))}.\`,
\t\t\t\`Built around ${humanList(subjects.slice(0, 3))}, ${product} also works in ${humanList(content.slice(0, 3))} throughout the checklist.\`
\t\t);
\t} else if (content.length) {
\t\topenings.push(
\t\t\t\`${product} builds beyond its base checklist with ${humanList(content.slice(0, 4))}.\`,
\t\t\t\`${product} offers a base set alongside ${humanList(content.slice(0, 4))}.\`,
\t\t\t\`The checklist for ${product} is supported by ${humanList(content.slice(0, 4))}, giving collectors several different angles to pursue.\`
\t\t);
\t} else if (subjects.length) {
\t\topenings.push(
\t\t\t\`${product} centers on ${humanList(subjects.slice(0, 3))} across its checklist.\`,
\t\t\t\`${product} puts ${humanList(subjects.slice(0, 3))} at the center of the release.\`,
\t\t\t\`The ${product} checklist is built primarily around ${humanList(subjects.slice(0, 3))}.\`
\t\t);
\t} else {
\t\topenings.push(
\t\t\t\`${product} adds another release to the season with a full base checklist and supporting chase content.\`,
\t\t\t\`${product} gives collectors another set-building option for the season, with additional content beyond the base cards.\`,
\t\t\t\`${product} is structured around a core checklist with additional chase elements spread throughout the release.\`
\t\t);
\t}

\tif (dateText && seed % 4 === 0) sentences.push(\`${product} arrived on ${dateText}.\`);
\telse sentences.push(chooseOverview(openings, seed, 1));

\tconst featureSentences = [];
\tif (/bowman/i.test(product) && signals.prospects) {
\t\tfeatureSentences.push(
\t\t\t'Prospect content carries much of the set, with early-career names appearing throughout the checklist.',
\t\t\t'The prospect side of the checklist gives the release a strong future-focused feel.',
\t\t\t'Prospects are a major piece of the set, giving collectors plenty of younger names to follow.'
\t\t);
\t}
\tif (/sapphire/i.test(product)) {
\t\tfeatureSentences.push(
\t\t\t'Sapphire styling gives the cards a distinct visual identity, while color variations add depth beyond the main set.',
\t\t\t'The Sapphire treatment separates this release visually, with additional color-driven versions layered onto the checklist.',
\t\t\t'Its Sapphire finish gives the product a recognizable look and creates another tier of color-focused collecting.'
\t\t);
\t} else if (/chrome/i.test(product) && signals.parallels) {
\t\tfeatureSentences.push(
\t\t\t'Chrome treatment and parallel versions give collectors plenty to pursue beyond the standard checklist.',
\t\t\t'The Chrome format adds another dimension to the set through its range of parallel versions.',
\t\t\t'Chrome styling is complemented by a deeper parallel structure for collectors who want more than the base set.'
\t\t);
\t}
\tif (signals.autographs && signals.memorabilia) {
\t\tfeatureSentences.push(
\t\t\t'Autographs and memorabilia cards give the release a hit-driven side without replacing the set-building core.',
\t\t\t'Signed cards and memorabilia pieces add premium targets alongside the regular checklist.',
\t\t\t'The product also includes both autograph and memorabilia content for collectors chasing hits.'
\t\t);
\t} else if (signals.autographs) {
\t\tfeatureSentences.push(
\t\t\t'Autographs add another layer to the release for collectors looking beyond the base and insert checklists.',
\t\t\t'Signed cards provide an additional target throughout the product.',
\t\t\t'Autograph content gives collectors another reason to dig deeper than the standard checklist.'
\t\t);
\t} else if (signals.memorabilia) {
\t\tfeatureSentences.push(
\t\t\t'Memorabilia cards add a hit-focused element alongside the main checklist.',
\t\t\t'The release also includes memorabilia content for collectors pursuing something beyond standard card variations.'
\t\t);
\t}
\tif (signals.inserts && signals.parallels && !/chrome|sapphire/i.test(product)) {
\t\tfeatureSentences.push(
\t\t\t'Insert sets and parallel versions give the checklist more variety beyond the base cards.',
\t\t\t'The mix of inserts and parallels creates several collecting paths within the same release.',
\t\t\t'Beyond the base set, inserts and parallel versions broaden the checklist considerably.'
\t\t);
\t}
\tif (featureSentences.length) sentences.push(chooseOverview(featureSentences, seed, 7));

\tif (signals.shortPrints || signals.caseHits) {
\t\tconst scarce = signals.shortPrints && signals.caseHits
\t\t\t? [
\t\t\t\t'Short prints and case-hit cards provide a scarcer tier for collectors looking for tougher pulls.',
\t\t\t\t'Collectors looking for the harder-to-find side of the product also have short prints and case hits to track down.',
\t\t\t\t'Scarcer short prints and case-hit cards sit above the standard checklist as tougher targets.'
\t\t\t]
\t\t\t: signals.shortPrints
\t\t\t\t? ['Short prints give collectors a tougher group of cards to track down beyond the regular checklist.', 'A short-print tier adds some scarcity for collectors looking for more difficult pulls.']
\t\t\t\t: ['Case-hit cards give the product a smaller group of tougher targets.', 'Case hits sit at the scarcer end of the release for collectors hunting difficult pulls.'];
\t\tsentences.push(chooseOverview(scarce, seed, 13));
\t}

\tif (dateText && seed % 4 !== 0) {
\t\tconst dateOptions = [
\t\t\t\`The product released on ${dateText}.\`,
\t\t\t\`Its release date was ${dateText}.\`,
\t\t\t\`${product} reached collectors on ${dateText}.\`
\t\t];
\t\tsentences.push(chooseOverview(dateOptions, seed, 17));
\t}
\tif (dateText && seed % 4 === 0 && openings.length) sentences.splice(1, 0, chooseOverview(openings, seed, 3));

\treturn collectorFacingOverview([...new Set(sentences.filter(Boolean))].slice(0, 4).join(' '));
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);
console.log('Enrichment overview variety engine installed.');
