import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function GET({ platform, params, request }) {
	const database = db(platform);

	const product = await database
		.prepare('SELECT image_key FROM products WHERE slug = ? AND published = 1')
		.bind(params.slug)
		.first();

	if (!product?.image_key) throw error(404, 'Image not found');

	const object = await platform.env.SET_IMAGES.get(product.image_key);
	if (!object) throw error(404, 'Image not found');

	const headers = new Headers();

	if (object.httpMetadata?.contentType) headers.set('content-type', object.httpMetadata.contentType);
	if (object.httpMetadata?.contentLanguage) headers.set('content-language', object.httpMetadata.contentLanguage);
	if (object.httpMetadata?.contentDisposition) headers.set('content-disposition', object.httpMetadata.contentDisposition);
	if (object.httpMetadata?.contentEncoding) headers.set('content-encoding', object.httpMetadata.contentEncoding);

	headers.set('etag', object.httpEtag);
	headers.set('cache-control', 'public, max-age=0, must-revalidate');

	const ifNoneMatch = request.headers.get('if-none-match');
	if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(object.body, { headers });
}
