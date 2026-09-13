// Local-only Supabase boundary for browser QA; never connects to production.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runOnce } from './portfolio-import-worker.mjs';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const dancerId = '22222222-2222-4222-8222-222222222222';
const user = { id: owner, email: 'portfolio-qa@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} };
const profile = { id: owner, display_name: 'Portfolio QA', is_admin: false, is_super_admin: false, can_create_project: false, instagram_handle: 'portfolioqa', instagram_verified_at: null };
let dancer = { id: dancerId, profile_id: owner, stage_name: 'Portfolio QA', korean_name: null, slug: 'portfolio-qa', gender: 'other', bio: 'QA profile', location: 'Seoul', specialties: [], genres: [], social_links: {}, profile_img: null, portfolio: [], approval_status: 'approved', approval_reject_reason: null, portfolio_file_url: null, portfolio_file_name: null, portfolio_file_size_bytes: null, portfolio_file_mime: null, portfolio_file_uploaded_at: null };
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table profiles(id uuid primary key); create table careers(id serial primary key,dancer_id uuid,title text,date date,details jsonb,type text,is_public boolean,is_representative boolean,sort_order int);`);
await db.exec(await readFile(new URL('../supabase/migrations/20260913084102_portfolio_journey.sql',import.meta.url),'utf8'));
await db.query('insert into profiles values($1)',[owner]);
const files = new Map();
const example = { profile: { stage_name: 'QA Dancer' }, careers: [
  { type: 'performance', title: 'QA Festival', date: '2025-03-01', _confidence: 'high', role: 'Dancer' },
  { type: 'award', title: 'QA Battle', date: '', _confidence: 'low', _raw_date: 'unknown' },
], warnings: ['Confirm the award date.'] };
const adapter = {
  rpc: async () => ({data:(await db.query('select * from claim_portfolio_import()')).rows}),
  from: table => ({update: values => {
    const filters=[];
    const execute=async()=>{
      const entries=Object.entries(values),args=entries.map(([,v])=>v);
      const where=filters.map(([k,v])=>{args.push(v);return `${k}=$${args.length}`;}).join(' and ');
      return {data:(await db.query(`update ${table} set ${entries.map(([k],i)=>`${k}=$${i+1}`).join(',')} where ${where} returning id`,args)).rows};
    };
    const chain={eq(k,v){filters.push([k,v]);return chain;},select:execute,then(r,j){return execute().then(r,j);}};
    return chain;
  }}),
  storage:{from:()=>({download:async key=>files.has(`portfolio-uploads/${key}`)?{data:new Blob([files.get(`portfolio-uploads/${key}`).data])}:{error:true}})},
};
function matches(row,search) {
  for (const [key,value] of search) {
    if (value.startsWith('eq.')) { const wanted=value.slice(3); if (typeof row[key]==='object' ? JSON.stringify(row[key])!==wanted : String(row[key])!==wanted) return false; }
    if (value.startsWith('neq.') && String(row[key])===value.slice(4)) return false;
    if(value==='is.null' && row[key]!=null) return false;
  }
  return true;
}
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,HEAD,OPTIONS');
  if(req.method==='OPTIONS'){res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:3321'), chunks=[];
  for await(const chunk of req) chunks.push(chunk);
  const bytes=Buffer.concat(chunks);
  let body; try{body=JSON.parse(bytes.toString());}catch{body=null;}
  const send=(data,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
  try {
    if(url.pathname==='/qa/state') return send({dancer,jobs:(await db.query('select * from portfolio_import_jobs')).rows,careers:(await db.query('select * from careers order by id')).rows,files:[...files.keys()]});
    if(url.pathname==='/auth/v1/user') return send(user);
    if(url.pathname==='/auth/v1/token') {
      const exp=Math.floor(Date.now()/1000)+3600;
      const token=[{alg:'HS256',typ:'JWT'},{sub:owner,exp,aud:'authenticated',role:'authenticated'},'signature'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
      return send({access_token:token,refresh_token:'qa-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user});
    }
    if(url.pathname==='/auth/v1/logout') return send({});
    if(url.pathname.startsWith('/storage/v1/object/')) {
      const key=decodeURIComponent(url.pathname.replace('/storage/v1/object/','').replace(/^public\//,''));
      if(req.method==='POST'){
        let data=bytes,type=req.headers['content-type'];
        if(type?.startsWith('multipart/form-data')) {
          const form=await new Request('http://localhost/upload',{method:'POST',headers:{'content-type':type},body:bytes}).formData();
          const file=form.get(''); data=Buffer.from(await file.arrayBuffer()); type=file.type;
        }
        files.set(key,{data,type});return send({Key:key});
      }
      const file=files.get(key); if(!file)return send({},404);
      res.setHeader('content-type',file.type||'application/octet-stream');res.end(file.data);return;
    }
    const table=url.pathname.split('/').pop();
    if(url.pathname.includes('/rpc/')){
      if(table==='enqueue_portfolio_import'){
        const r=await db.query('select enqueue_portfolio_import($1,$2,$3,$4,$5) as id',[body.p_profile,body.p_request,body.p_kind,body.p_text,body.p_path]);
        setTimeout(()=>runOnce(adapter,async()=>example).catch(console.error),1200);
        return send(r.rows[0].id);
      }
      if(table==='get_public_dancer'||table==='get_public_dancer_by_slug'||table==='get_public_dancer_by_id')return send([dancer]);
      if(table==='next_available_slug')return send(body.base);
      return send([]);
    }
    let rows=[];
    if(table==='profiles')rows=[profile];
    if(table==='dancers'){
      if(req.method==='PATCH') {if(!matches(dancer,url.searchParams))return send([]); dancer={...dancer,...body};return send([dancer]);}
      rows=[dancer];
    }
    if(table==='portfolio_import_jobs'){
      if(req.method==='PATCH'){
        const entries=Object.entries(body),args=entries.map(([,v])=>v);
        args.push(url.searchParams.get('id')?.slice(3),url.searchParams.get('profile_id')?.slice(3));
        await db.query(`update portfolio_import_jobs set ${entries.map(([k],i)=>`${k}=$${i+1}`).join(',')} where id=$${args.length-1} and profile_id=$${args.length}`,args);
      }
      rows=(await db.query('select * from portfolio_import_jobs order by created_at desc')).rows;
    }
    if(table==='careers'){
      if(req.method==='POST'){
        const entries=Object.entries(body),args=entries.map(([,v])=>v);
        await db.query(`insert into careers(${entries.map(([k])=>k).join(',')}) values(${args.map((_,i)=>`$${i+1}`).join(',')}) on conflict(dancer_id,import_key) do nothing`,args);
      }
      if(req.method==='PATCH'){
        const id=url.searchParams.get('id')?.slice(3),entries=Object.entries(body),args=entries.map(([,v])=>v);args.push(id);
        await db.query(`update careers set ${entries.map(([k],i)=>`${k}=$${i+1}`).join(',')} where id=$${args.length}`,args);
      }
      rows=(await db.query('select * from careers')).rows;
    }
    rows=rows.filter(row=>matches(row,url.searchParams));
    res.setHeader('Content-Range',`0-${Math.max(0,rows.length-1)}/${rows.length}`);
    if(req.headers.accept?.includes('vnd.pgrst.object')) return send(rows[0]??null);
    return send(rows);
  } catch(error){send({message:error.message},400);}
}).listen(3321,'127.0.0.1',()=>console.log('QA Supabase boundary on 3321; production access disabled'));
