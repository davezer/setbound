import { db } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
export async function load({ platform, url }) {
 const database=db(platform);
 const requestedSport=url.searchParams.get('sport')?.trim();
 if(requestedSport && requestedSport!=='All sports'){
   const sport=await database.prepare('SELECT slug FROM sports WHERE lower(name)=lower(?) OR lower(slug)=lower(?) LIMIT 1').bind(requestedSport,requestedSport).first();
   if(sport?.slug)throw redirect(308,`/sets/sport/${sport.slug}`);
 }
 const [categoryResult, cardResult, previewResult, latestResult]=await Promise.all([
  database.prepare(`SELECT s.id,s.name,s.slug,COUNT(p.id) AS set_count,MIN(p.year) AS first_year,MAX(p.year) AS latest_year FROM sports s JOIN products p ON p.sport_id=s.id AND p.published=1 GROUP BY s.id ORDER BY set_count DESC,s.name`).all(),
  database.prepare(`SELECT p.sport_id,COUNT(*) AS card_count FROM cards c JOIN products p ON p.id=c.product_id WHERE p.published=1 GROUP BY p.sport_id`).all(),
  database.prepare(`SELECT slug,year,name,image_key,sport_slug,sport_name,manufacturer_name FROM (SELECT p.slug,p.year,p.name,p.image_key,s.slug AS sport_slug,s.name AS sport_name,m.name AS manufacturer_name,ROW_NUMBER() OVER(PARTITION BY p.sport_id ORDER BY p.year DESC,p.id DESC) AS rank_in_sport FROM products p JOIN sports s ON s.id=p.sport_id JOIN manufacturers m ON m.id=p.manufacturer_id WHERE p.published=1 AND p.image_key IS NOT NULL) ranked WHERE rank_in_sport<=3`).all(),
  database.prepare(`WITH newest AS (SELECT id,slug,year,name,image_key,manufacturer_id,sport_id FROM products WHERE published=1 ORDER BY year DESC,id DESC LIMIT 6) SELECT p.slug,p.year,p.name,p.image_key,m.name AS manufacturer_name,s.name AS sport_name,s.slug AS sport_slug,(SELECT COUNT(*) FROM cards c WHERE c.product_id=p.id) AS card_count,(SELECT COUNT(*) FROM checklists cl WHERE cl.product_id=p.id) AS checklist_count FROM newest p JOIN manufacturers m ON m.id=p.manufacturer_id JOIN sports s ON s.id=p.sport_id`).all()
 ]);
 const counts=new Map((cardResult.results||[]).map(x=>[Number(x.sport_id),Number(x.card_count||0)]));
 const previews=new Map();for(const p of previewResult.results||[]){if(!previews.has(p.sport_slug))previews.set(p.sport_slug,[]);previews.get(p.sport_slug).push(p);}
 const categories=(categoryResult.results||[]).map(x=>({...x,set_count:Number(x.set_count||0),card_count:counts.get(Number(x.id))||0,first_year:Number(x.first_year||0),latest_year:Number(x.latest_year||0),previews:previews.get(x.slug)||[]}));
 return {categories,latest:latestResult.results||[]};
}
