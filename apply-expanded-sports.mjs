import fs from 'node:fs';

const path = 'src/lib/server/source-harvester.js';

if (!fs.existsSync(path)) {
	console.error(`Could not find ${path}. Install the Source Harvester first.`);
	process.exit(1);
}

let source = fs.readFileSync(path, 'utf8');

if (source.includes("return 'Golf';") && source.includes("return 'Boxing';")) {
	console.log('Source Harvester sport inference is already expanded.');
	process.exit(0);
}

const oldBlock = `export function inferSport(name) {
	const value = String(name || '').toLowerCase();

	if (/\\bbaseball\\b|\\bmlb\\b/.test(value)) return 'Baseball';
	if (/\\bfootball\\b|\\bnfl\\b/.test(value)) return 'Football';
	if (/\\bwwe\\b|\\bwrestling\\b/.test(value)) return 'Wrestling';
	if (/\\bbasketball\\b|\\bnba\\b|\\bwnba\\b|\\bnbl\\b|\\bg[- ]?league\\b/.test(value)) return 'Basketball';
	if (/\\bufc\\b|\\bmma\\b/.test(value)) return 'MMA';
	if (/\\bsoccer\\b|\\bmls\\b|\\bpremier league\\b|\\buefa\\b|\\bbundesliga\\b|\\bchampions league\\b/.test(value)) return 'Soccer';
	if (/\\bformula 1\\b|\\bf1\\b|\\bracing\\b/.test(value)) return 'Racing';
	if (/\\bhockey\\b|\\bnhl\\b/.test(value)) return 'Hockey';
	if (/\\btennis\\b/.test(value)) return 'Tennis';

	return '';
}`;

const newBlock = `export function inferSport(name) {
	const value = String(name || '').toLowerCase();

	if (/\\bbaseball\\b|\\bmlb\\b/.test(value)) return 'Baseball';
	if (/\\bfootball\\b|\\bnfl\\b/.test(value)) return 'Football';
	if (/\\bbasketball\\b|\\bnba\\b|\\bwnba\\b|\\bnbl\\b|\\bg[- ]?league\\b/.test(value)) return 'Basketball';
	if (/\\bhockey\\b|\\bnhl\\b|\\bah l\\b|\\bahl\\b/.test(value)) return 'Hockey';
	if (/\\bwwe\\b|\\bwrestling\\b|\\baew\\b/.test(value)) return 'Wrestling';

	// Soccer products do not always literally contain "soccer" in the name.
	if (/\\bsoccer\\b|\\bmls\\b|\\bnwsl\\b|\\bfifa\\b|\\buefa\\b|\\bpremier league\\b|\\bbundesliga\\b|\\bchampions league\\b|\\bmanchester united\\b/.test(value)) return 'Soccer';

	if (/\\bgolf\\b|\\bpga\\b|\\blpga\\b/.test(value)) return 'Golf';
	if (/\\bufc\\b|\\bmma\\b|\\bmixed martial arts\\b/.test(value)) return 'MMA';
	if (/\\bboxing\\b|\\bboxer\\b/.test(value)) return 'Boxing';
	if (/\\bformula 1\\b|\\bf1\\b|\\bnascar\\b|\\bindycar\\b|\\bracing\\b/.test(value)) return 'Racing';
	if (/\\btennis\\b|\\batp\\b|\\bwta\\b/.test(value)) return 'Tennis';
	if (/\\blacrosse\\b|\\bpll\\b/.test(value)) return 'Lacrosse';
	if (/\\bcricket\\b/.test(value)) return 'Cricket';

	if (/\\bmulti[- ]sport\\b|\\bolympic\\b|\\bolympics\\b/.test(value)) return 'Multi-Sport';
	if (/\\bnon[- ]sport\\b|\\bstar wars\\b|\\bmarvel\\b|\\bdisney\\b|\\bentertainment\\b/.test(value)) return 'Non-Sport';

	return '';
}`;

if (!source.includes(oldBlock)) {
	console.error('Could not find the current inferSport() block. Your Source Harvester file differs from the expected version.');
	process.exit(1);
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(path, source);
console.log('Expanded Source Harvester sport inference.');
