import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function file(rel) {
	return path.join(root, rel);
}

function patch(rel, transform) {
	const target = file(rel);
	if (!fs.existsSync(target)) throw new Error(`Missing ${rel}`);

	const before = fs.readFileSync(target, 'utf8');
	if (before.includes('SEO-PASS:setbound')) {
		console.log(`skip  ${rel} (already patched)`);
		return;
	}

	const after = transform(before);
	if (after === before) throw new Error(`Could not find expected patch location in ${rel}`);

	fs.writeFileSync(`${target}.seo-backup`, before, 'utf8');
	fs.writeFileSync(target, after, 'utf8');
	console.log(`patch ${rel}`);
}

function replaceExact(content, from, to, rel) {
	if (!content.includes(from)) throw new Error(`Expected text not found in ${rel}`);
	return content.replace(from, to);
}

patch('src/routes/+page.svelte', (content) => replaceExact(
	content,
	'<svelte:head><title>Setbound — sports card checklists</title></svelte:head>',
	`<!-- SEO-PASS:setbound -->\n<svelte:head>\n\t<title>Sports Card Checklists & Collection Tracking | Setbound</title>\n\t<meta name="description" content="Browse sports card checklists, search players and teams, and track the cards you own or want with Setbound." />\n\t<meta name="robots" content="index,follow" />\n\t<link rel="canonical" href="https://setbound.app/" />\n\t<meta property="og:type" content="website" />\n\t<meta property="og:site_name" content="Setbound" />\n\t<meta property="og:title" content="Sports Card Checklists & Collection Tracking | Setbound" />\n\t<meta property="og:description" content="Browse sports card checklists, search players and teams, and track the cards you own or want." />\n\t<meta property="og:url" content="https://setbound.app/" />\n\t<meta name="twitter:card" content="summary" />\n\t<script type="application/ld+json">{JSON.stringify({\n\t\t'@context': 'https://schema.org',\n\t\t'@type': 'WebSite',\n\t\tname: 'Setbound',\n\t\turl: 'https://setbound.app/',\n\t\tpotentialAction: {\n\t\t\t'@type': 'SearchAction',\n\t\t\ttarget: 'https://setbound.app/search?q={search_term_string}',\n\t\t\t'query-input': 'required name=search_term_string'\n\t\t}\n\t})}</script>\n</svelte:head>`,
	'src/routes/+page.svelte'
));

patch('src/routes/sets/+page.svelte', (content) => replaceExact(
	content,
	'<svelte:head><title>Sets — setbound</title></svelte:head>',
	`<!-- SEO-PASS:setbound -->\n<svelte:head>\n\t<title>Sports Card Sets & Checklists | Setbound</title>\n\t<meta name="description" content="Browse sports card sets and complete checklists by year, sport and manufacturer on Setbound." />\n\t<meta name="robots" content="index,follow" />\n\t<link rel="canonical" href="https://setbound.app/sets" />\n\t<meta property="og:type" content="website" />\n\t<meta property="og:title" content="Sports Card Sets & Checklists | Setbound" />\n\t<meta property="og:description" content="Browse sports card sets and complete checklists by year, sport and manufacturer." />\n\t<meta property="og:url" content="https://setbound.app/sets" />\n</svelte:head>`,
	'src/routes/sets/+page.svelte'
));

patch('src/routes/search/+page.svelte', (content) => replaceExact(
	content,
	'<svelte:head><title>Search — setbound</title></svelte:head>',
	`<!-- SEO-PASS:setbound -->\n<svelte:head>\n\t<title>{data.q ? 'Search “' + data.q + '” | Setbound' : 'Search Sports Card Checklists | Setbound'}</title>\n\t<meta name="description" content="Search Setbound for sports card players, card numbers, teams, products and checklists." />\n\t<meta name="robots" content="noindex,follow" />\n\t<link rel="canonical" href="https://setbound.app/search" />\n</svelte:head>`,
	'src/routes/search/+page.svelte'
));

patch('src/routes/subjects/[id]/+page.svelte', (content) => {
	content = replaceExact(
		content,
		'\tlet { data } = $props();\n',
		`\tlet { data } = $props();\n\n\t// SEO-PASS:setbound\n\tconst seoTitle = $derived(data.subject.name + ' Sports Cards & Checklists | Setbound');\n\tconst seoDescription = $derived('Browse ' + data.stats.cards.toLocaleString() + ' ' + data.subject.name + ' cards across ' + data.stats.sets + ' sets, with card numbers, checklists and affiliations.');\n\tconst canonicalUrl = $derived('https://setbound.app/subjects/' + data.subject.id);\n\tconst shouldIndex = $derived(data.stats.cards >= 2);\n`,
		'src/routes/subjects/[id]/+page.svelte'
	);
	return replaceExact(
		content,
		'<svelte:head><title>{data.subject.name} cards — setbound</title></svelte:head>',
		`<svelte:head>\n\t<title>{seoTitle}</title>\n\t<meta name="description" content={seoDescription} />\n\t<meta name="robots" content={shouldIndex ? 'index,follow' : 'noindex,follow'} />\n\t<link rel="canonical" href={canonicalUrl} />\n\t<meta property="og:type" content="website" />\n\t<meta property="og:title" content={seoTitle} />\n\t<meta property="og:description" content={seoDescription} />\n\t<meta property="og:url" content={canonicalUrl} />\n\t<script type="application/ld+json">{JSON.stringify({\n\t\t'@context': 'https://schema.org',\n\t\t'@type': 'CollectionPage',\n\t\tname: seoTitle,\n\t\tdescription: seoDescription,\n\t\turl: canonicalUrl,\n\t\tmainEntity: {\n\t\t\t'@type': 'ItemList',\n\t\t\tnumberOfItems: data.stats.cards\n\t\t}\n\t})}</script>\n</svelte:head>`,
		'src/routes/subjects/[id]/+page.svelte'
	);
});

patch('src/routes/teams/[id]/+page.svelte', (content) => {
	content = replaceExact(
		content,
		'\tlet { data } = $props();\n',
		`\tlet { data } = $props();\n\n\t// SEO-PASS:setbound\n\tconst seoTitle = $derived(data.affiliation.name + ' Sports Cards & Checklists | Setbound');\n\tconst seoDescription = $derived('Browse ' + data.stats.cards.toLocaleString() + ' ' + data.affiliation.name + ' cards across ' + data.stats.sets + ' sets and ' + data.stats.subjects + ' subjects on Setbound.');\n\tconst canonicalUrl = $derived('https://setbound.app/teams/' + data.affiliation.id);\n\tconst shouldIndex = $derived(data.stats.cards >= 2);\n`,
		'src/routes/teams/[id]/+page.svelte'
	);
	return replaceExact(
		content,
		'<svelte:head><title>{data.affiliation.name} cards — setbound</title></svelte:head>',
		`<svelte:head>\n\t<title>{seoTitle}</title>\n\t<meta name="description" content={seoDescription} />\n\t<meta name="robots" content={shouldIndex ? 'index,follow' : 'noindex,follow'} />\n\t<link rel="canonical" href={canonicalUrl} />\n\t<meta property="og:type" content="website" />\n\t<meta property="og:title" content={seoTitle} />\n\t<meta property="og:description" content={seoDescription} />\n\t<meta property="og:url" content={canonicalUrl} />\n\t<script type="application/ld+json">{JSON.stringify({\n\t\t'@context': 'https://schema.org',\n\t\t'@type': 'CollectionPage',\n\t\tname: seoTitle,\n\t\tdescription: seoDescription,\n\t\turl: canonicalUrl,\n\t\tmainEntity: {\n\t\t\t'@type': 'ItemList',\n\t\t\tnumberOfItems: data.stats.cards\n\t\t}\n\t})}</script>\n</svelte:head>`,
		'src/routes/teams/[id]/+page.svelte'
	);
});

patch('src/routes/sets/[slug]/+page.svelte', (content) => {
	content = replaceExact(
		content,
		'\tlet { data } = $props();\n',
		`\tlet { data } = $props();\n\n\t// SEO-PASS:setbound\n\tconst fullProductTitle = $derived(String(data.product.year) + ' ' + data.product.name);\n\tconst seoTitle = $derived(fullProductTitle + ' Checklist, Cards & Set Details | Setbound');\n\tconst seoDescription = $derived.by(() => {\n\t\tconst fallback = 'Browse the complete ' + fullProductTitle + ' checklist with ' + data.cards.length.toLocaleString() + ' cards across ' + data.checklists.length + ' checklists. Search players, card numbers and affiliations and track your collection.';\n\t\tconst source = String(data.product.product_notes || fallback).replace(/\\s+/g, ' ').trim();\n\t\treturn source.length > 158 ? source.slice(0, 155).trimEnd() + '…' : source;\n\t});\n\tconst canonicalUrl = $derived('https://setbound.app/sets/' + data.product.slug);\n\tconst socialImage = $derived(data.product.image_key ? 'https://setbound.app/media/set/' + data.product.slug : null);\n`,
		'src/routes/sets/[slug]/+page.svelte'
	);
	return replaceExact(
		content,
		'<svelte:head><title>{data.product.year} {data.product.name} — setbound</title></svelte:head>',
		`<svelte:head>\n\t<title>{seoTitle}</title>\n\t<meta name="description" content={seoDescription} />\n\t<meta name="robots" content="index,follow" />\n\t<link rel="canonical" href={canonicalUrl} />\n\t<meta property="og:type" content="website" />\n\t<meta property="og:site_name" content="Setbound" />\n\t<meta property="og:title" content={seoTitle} />\n\t<meta property="og:description" content={seoDescription} />\n\t<meta property="og:url" content={canonicalUrl} />\n\t{#if socialImage}<meta property="og:image" content={socialImage} />{/if}\n\t<meta name="twitter:card" content={socialImage ? 'summary_large_image' : 'summary'} />\n\t<script type="application/ld+json">{JSON.stringify({\n\t\t'@context': 'https://schema.org',\n\t\t'@graph': [\n\t\t\t{\n\t\t\t\t'@type': 'CollectionPage',\n\t\t\t\tname: fullProductTitle,\n\t\t\t\tdescription: seoDescription,\n\t\t\t\turl: canonicalUrl,\n\t\t\t\tdatePublished: data.product.release_date || undefined,\n\t\t\t\timage: socialImage || undefined,\n\t\t\t\tmainEntity: {\n\t\t\t\t\t'@type': 'ItemList',\n\t\t\t\t\tnumberOfItems: data.cards.length\n\t\t\t\t}\n\t\t\t},\n\t\t\t{\n\t\t\t\t'@type': 'BreadcrumbList',\n\t\t\t\titemListElement: [\n\t\t\t\t\t{ '@type': 'ListItem', position: 1, name: 'Sets', item: 'https://setbound.app/sets' },\n\t\t\t\t\t{ '@type': 'ListItem', position: 2, name: fullProductTitle, item: canonicalUrl }\n\t\t\t\t]\n\t\t\t}\n\t\t]\n\t})}</script>\n</svelte:head>`,
		'src/routes/sets/[slug]/+page.svelte'
	);
});

console.log('\nSEO page metadata patched successfully.');
console.log('Backups were written beside each changed page as *.seo-backup');
console.log('Now copy the new src/lib/seo.js, robots.txt route, and sitemap.xml route from the zip, then run npm run check.');
