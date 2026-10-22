import fs from 'node:fs';
const cssPath='src/styles.css', homePath='src/routes/+page.svelte', headerPath='src/lib/components/Header.svelte', appPath='src/app.html';
const paths=[cssPath,homePath,headerPath,appPath];
const file=Object.fromEntries(paths.map(p=>[p,fs.readFileSync(p,'utf8')]));
function replaceOnce(s,a,b){const n=s.split(a).length-1;if(n!==1)throw Error('Expected one matching anchor ('+n+'): '+a.slice(0,65)+'. No files changed.');return s.replace(a,b);}
let css=file[cssPath];
css=replaceOnce(css,"@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Libre+Caslon+Display&display=swap');","@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');");
css=replaceOnce(css,'  --ink:#12100E;\n  --paper:#FCFCFC;\n  --orange:#EE964B;\n  --blue:#40798C;\n  --granite:#7F7B82;\n  --muted:#6d6a6f;\n  --line:#e7e5e7;\n  --line-strong:#d5d2d5;\n  --soft:#f3f2f3;\n  --display:\'Libre Caslon Display\', Georgia, serif;',
'  --ink:#112C43;\n  --paper:#FFFFFF;\n  --orange:#F46A22;\n  --blue:#176B9A;\n  --granite:#718391;\n  --muted:#596A78;\n  --line:#E1E8EE;\n  --line-strong:#C4D1DC;\n  --soft:#F2F6FA;\n  --display:\'Space Grotesk\', ui-sans-serif, system-ui, sans-serif;');
css=replaceOnce(css,'rgba(64,121,140,.1)','rgba(23,107,154,.14)');
css=replaceOnce(css,'background:#fafafa;','background:var(--soft);');
css+='\n:focus-visible{outline:2px solid var(--blue);outline-offset:2px}\n::selection{background:#FCE1D1;color:var(--ink)}\n';
let home=file[homePath];
home=replaceOnce(home,'font-size:clamp(4rem,8vw,7.6rem);font-weight:500;letter-spacing:-.075em;line-height:.82;','font-size:clamp(3.7rem,7vw,6.6rem);font-weight:700;letter-spacing:-.07em;line-height:.98;');
home=replaceOnce(home,'.hero-copy h1 span{color:var(--blue)}','.hero-copy h1 span{color:var(--orange)}');
home=replaceOnce(home,'background:#faf9f7;padding:5rem 0','background:var(--soft);padding:5rem 0');
home=home.replaceAll('font-weight:500;letter-spacing:-.055em','font-weight:600;letter-spacing:-.055em').replaceAll('font-weight:500;letter-spacing:-.04em','font-weight:600;letter-spacing:-.04em');
let header=file[headerPath];
header=replaceOnce(header,'background:rgba(252,252,252,.94);','background:rgba(255,255,255,.96);');
header=replaceOnce(header,'color:#4d494b;','color:var(--ink);');
header=replaceOnce(header,'background:#f1f0f0','background:var(--soft)');
let app=replaceOnce(file[appPath],'content="#FCFCFC"','content="#FFFFFF"');
fs.writeFileSync(cssPath,css);fs.writeFileSync(homePath,home);fs.writeFileSync(headerPath,header);fs.writeFileSync(appPath,app);
console.log('Setbound brand applied; no backups or migrations.');
