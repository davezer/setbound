import fs from 'node:fs';

const path = 'src/routes/api/import/+server.js';

if (!fs.existsSync(path)) {
	console.error(`Could not find ${path}`);
	process.exit(1);
}

let source = fs.readFileSync(path, 'utf8');

const broken = `\t\t\t\t\t}
\t\t\t\t}
\t\t\t\t}
\t\t\t}

\t\t\tawait database
\t\t\t\t.prepare(\`
\t\t\t\t\tINSERT INTO cards`;

const fixed = `\t\t\t\t\t}
\t\t\t\t}
\t\t\t}

\t\t\tawait database
\t\t\t\t.prepare(\`
\t\t\t\t\tINSERT INTO cards`;

if (source.includes(broken)) {
	source = source.replace(broken, fixed);
	fs.writeFileSync(path, source);
	console.log('Removed the extra closing brace from the franchise affiliation block.');
} else if (source.includes(fixed)) {
	console.log('The franchise affiliation brace fix is already applied.');
} else {
	console.error('Could not find the expected franchise affiliation block. No file was changed.');
	process.exit(1);
}
