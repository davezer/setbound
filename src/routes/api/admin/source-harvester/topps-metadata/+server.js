import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { fetchAndCacheToppsMetadata } from '$lib/server/topps-product-metadata.js';

export async function GET({ url, platform, fetch }) {
	const database=db(platform); const name=String(url.searchParams.get('name')||'').trim(); const yearRaw=Number(url.searchParams.get('year')); const year=Number.isInteger(yearRaw)?yearRaw:null; const checklistUrl=String(url.searchParams.get('checklistUrl')||'').trim();
	if(!name) return json({message:'Missing product name.'},{status:400});
	const result=await fetchAndCacheToppsMetadata(database,fetch,{name,year,checklistUrl});
	if(!result.metadata) return json({ok:false,cached:false,message:result.error||'Topps product metadata was unavailable.'},{status:404});
	return json({ok:true,cached:result.cached,metadata:result.metadata});
}
