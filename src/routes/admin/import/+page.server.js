import { db } from '$lib/server/db';
export async function load({ platform, url }) {
  try { const database=db(platform); const [sports,manufacturers,affiliations]=await Promise.all([
    database.prepare('SELECT id,name,slug FROM sports ORDER BY sort_order,name').all(),
    database.prepare('SELECT id,name,slug FROM manufacturers ORDER BY name').all(),
    database.prepare('SELECT id,name,aliases_json FROM affiliations ORDER BY length(name) DESC').all()
  ]); return {
      sports:sports.results||[],
      manufacturers:manufacturers.results||[],
      affiliations:(affiliations.results||[]).map(a=>({...a,aliases:JSON.parse(a.aliases_json||'[]')})),
      prefill:{
        year:Number(url.searchParams.get('year')||0)||null,
        name:String(url.searchParams.get('name')||''),
        source:String(url.searchParams.get('source')||'')
      }
    }; }
  catch{return {sports:[{id:1,name:'Baseball',slug:'baseball'}],manufacturers:[{id:1,name:'Topps',slug:'topps'}],affiliations:[],prefill:{year:null,name:'',source:''}};}
}
