import fs from 'node:fs';

function mustReplace(source, search, replacement, label) {
	if (!source.includes(search)) {
		throw new Error(`${label}: expected code was not found. Your local file may differ from the repo version.`);
	}
	return source.replace(search, replacement);
}

// 1) New imports become drafts instead of immediately public.
{
	const path = 'src/routes/api/import/+server.js';
	let source = fs.readFileSync(path, 'utf8');

	if (source.includes('(?, ?, ?, ?, ?, ?, 0)')) {
		console.log('Import drafts: already applied');
	} else {
		source = mustReplace(
			source,
			'(?, ?, ?, ?, ?, ?, 1)',
			'(?, ?, ?, ?, ?, ?, 0)',
			'Import draft default'
		);
		fs.writeFileSync(path, source);
		console.log('Import drafts: new imports now start unpublished');
	}
}

// 2) Admin set loader exposes published state and adds publish/unpublish action.
{
	const path = 'src/routes/admin/sets/+page.server.js';
	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes('p.published')) {
		source = mustReplace(
			source,
			'SELECT p.id,p.slug,p.year,p.name,p.image_key,p.release_date,m.name manufacturer_name,s.name sport_name',
			'SELECT p.id,p.slug,p.year,p.name,p.image_key,p.release_date,p.published,m.name manufacturer_name,s.name sport_name',
			'Admin set published select'
		);
	}

	if (!source.includes('visibility:async')) {
		source = mustReplace(
			source,
			"\n  clear:async({request,platform})=>{",
			`
  visibility:async({request,platform})=>{
    const database=db(platform);
    const form=await request.formData();
    const productId=Number(form.get('product_id'));
    const nextPublished=String(form.get('published')||'0')==='1'?1:0;

    if(!Number.isInteger(productId)||productId<=0) return fail(400,{message:'Choose a valid set.'});

    const product=await database.prepare('SELECT id FROM products WHERE id=?').bind(productId).first();
    if(!product) return fail(404,{message:'Set not found.'});

    await database.prepare(\`UPDATE products SET published=?,updated_at=datetime('now') WHERE id=?\`)
      .bind(nextPublished,productId)
      .run();

    throw redirect(303,\`/admin/sets?\${nextPublished?'live':'offline'}=1\`);
  },

  clear:async({request,platform})=>{`,
			'Admin visibility action'
		);
	}

	fs.writeFileSync(path, source);
	console.log('Admin server: published state + visibility action applied');
}

// 3) Manage Sets UI gets Draft/Live status and Go live / Take offline controls.
{
	const path = 'src/routes/admin/sets/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes('class="status live"')) {
		source = mustReplace(
			source,
			`<div class="meta">{product.sport_name} · {product.manufacturer_name} · {product.year}</div>
					<strong>{product.name}</strong>
					<span>{product.release_date ? \`Release: \${product.release_date}\` : 'No release date yet'}</span>`,
			`<div class="meta">{product.sport_name} · {product.manufacturer_name} · {product.year}</div>
					<div class="title-line">
						<strong>{product.name}</strong>
						{#if product.published}
							<span class="status live">Live</span>
						{:else}
							<span class="status draft">Draft</span>
						{/if}
					</div>
					<span>{product.release_date ? \`Release: \${product.release_date}\` : 'No release date yet'}</span>`,
			'Admin status badge'
		);

		source = mustReplace(
			source,
			`<div class="actions">
					<a class="edit" href={\`/admin/product/\${product.id}\`}>Edit details</a>`,
			`<div class="actions">
					<form method="POST" action="?/visibility">
						<input type="hidden" name="product_id" value={product.id} />
						<input type="hidden" name="published" value={product.published ? '0' : '1'} />
						<button class:offline={product.published} class:golive={!product.published} class="visibility">
							{product.published ? 'Take offline' : 'Go live'}
						</button>
					</form>

					<a class="edit" href={\`/admin/product/\${product.id}\`}>Edit details</a>`,
			'Admin visibility button'
		);

		source = mustReplace(
			source,
			`.info{display:grid;gap:.25rem}.info>span{color:var(--muted);font-size:.7rem}.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.actions`,
			`.info{display:grid;gap:.25rem}.info>span{color:var(--muted);font-size:.7rem}.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.title-line{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.status{display:inline-flex;padding:.18rem .4rem;border-radius:999px;font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.status.live{background:#edf7f1;color:#25734d}.status.draft{background:#f2f0ed;color:#766f67}.actions`,
			'Admin status styles'
		);

		source = mustReplace(
			source,
			`.upload,.clear,.edit{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer;text-decoration:none;color:inherit}`,
			`.upload,.clear,.edit,.visibility{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer;text-decoration:none;color:inherit}.visibility.golive{background:#182a20;color:#fff;border-color:#182a20}.visibility.offline{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}`,
			'Admin visibility styles'
		);

		fs.writeFileSync(path, source);
		console.log('Admin page: Draft/Live badges + controls applied');
	} else {
		console.log('Admin page: visibility UI already applied');
	}
}

console.log('');
console.log('Setbound draft / go-live workflow installed.');
console.log('Existing published products stay live. New imports start as Draft.');
