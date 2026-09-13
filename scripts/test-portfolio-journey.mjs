import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parsedPortfolioSchema, importInputSchema } from '../src/lib/portfolio-import/schema.ts';
import { runOnce, extractPortfolio, portfolioOAuthEnv } from './portfolio-import-worker.mjs';
import { isValidPortfolioStoragePath } from '../src/lib/storage/portfolio-uploads.ts';

export const sample = () => ({ profile: { stage_name: 'QA Dancer' }, careers: [
  { type: 'performance', title: 'QA stage', date: '2025-03-01', _confidence: 'high' },
  { type: 'award', title: 'QA award, date unknown', date: '', _confidence: 'low', _raw_date: 'unknown' },
], warnings: ['Confirm the award date.'] });

test('input bounds, unknown dates retained, impossible dates rejected', () => {
  const owner = crypto.randomUUID();
  assert.equal(isValidPortfolioStoragePath(`${owner}/portfolio_${crypto.randomUUID()}.pdf`,owner),true);
  for (const file of ['../other.pdf','%2e%2e/other.pdf','%252e%252e/other.pdf','portfolio_a.pdf?x=1','nested/portfolio_a.pdf'])
    assert.equal(isValidPortfolioStoragePath(`${owner}/${file}`,owner),false);
  const env = portfolioOAuthEnv({ Path: 'path', APPDATA: 'appdata', SUPABASE_SERVICE_ROLE_KEY: 'secret', ANTHROPIC_API_KEY: 'paid', SMTP_PASS: 'secret' });
  assert.equal(env.Path, 'path');
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.SMTP_PASS, undefined);
  assert.equal(importInputSchema.safeParse({ kind: 'text', text: ' ' }).success, false);
  assert.equal(importInputSchema.safeParse({ kind: 'text', text: 'a'.repeat(50001) }).success, false);
  assert.equal(parsedPortfolioSchema.parse(sample()).careers.length, 2);
  const invalid = sample(); invalid.careers[0].date = '2025-02-31';
  assert.equal(parsedPortfolioSchema.safeParse(invalid).success, false);
  invalid.careers[0].date = '2025-03-01'; invalid.careers[0].type = 'admin';
  assert.equal(parsedPortfolioSchema.safeParse(invalid).success, false);
});

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table profiles(id uuid primary key);
    create table careers(id serial primary key,dancer_id uuid,title text,date date,details jsonb,type text,is_public boolean,is_representative boolean,sort_order int);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260913084102_portfolio_journey.sql', import.meta.url), 'utf8'));
  return db;
}

export function workerDbAdapter(db, files = new Map()) {
  return {
    rpc: async () => ({ data: (await db.query('select * from claim_portfolio_import()')).rows }),
    from: table => ({ update: values => {
      const filters = [];
      async function execute() {
        const entries = Object.entries(values), args = entries.map(([, v]) => v);
        const where = filters.map(([k,v]) => { args.push(v); return `${k}=$${args.length}`; }).join(' and ');
        const result = await db.query(`update ${table} set ${entries.map(([k],i) => `${k}=$${i+1}`).join(',')} where ${where} returning id`, args);
        return { data: result.rows };
      }
      const chain = { eq(k,v) { filters.push([k,v]); return chain; }, select: execute, then(resolve,reject) { return execute().then(resolve,reject); } };
      return chain;
    } }),
    storage: { from: () => ({ download: async key => files.has(key) ? { data: new Blob([files.get(key)]) } : { error: true } }) },
  };
}

test('database privacy, rate limit, claim recovery, idempotency and worker state machine', async () => {
  const db = await createTestDb();
  try {
    const owner = crypto.randomUUID(), other = crypto.randomUUID(), request = crypto.randomUUID();
    await db.query('insert into profiles values($1),($2)', [owner, other]);
    const enqueue = req => db.query("select enqueue_portfolio_import($1,$2,'text','QA source',null) as id", [owner,req]);
    const id = (await enqueue(request)).rows[0].id;
    assert.equal((await enqueue(request)).rows[0].id, id);
    await assert.rejects(enqueue(crypto.randomUUID()), /IMPORT_RATE_LIMIT/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from portfolio_import_jobs')).rows.length, 0);
    await assert.rejects(db.query("update portfolio_import_jobs set status='ready'"), /permission denied/);
    await assert.rejects(db.query('select * from claim_portfolio_import()'), /permission denied/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from portfolio_import_jobs')).rows.length, 1);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from portfolio_import_jobs'), /permission denied/);
    await db.exec('reset role');
    const adapter = workerDbAdapter(db);
    assert.equal(await runOnce(adapter, async () => sample()), true);
    assert.equal((await db.query('select status from portfolio_import_jobs where id=$1',[id])).rows[0].status, 'ready');
    assert.equal((await db.query('select * from careers')).rows.length, 0, 'model cannot directly publish careers');
    assert.equal(await runOnce(adapter, async () => sample()), false);
    const failedId = crypto.randomUUID();
    await db.query("insert into portfolio_import_jobs(id,profile_id,request_id,kind,source_text) values($1,$2,$3,'text','QA')",[failedId,owner,crypto.randomUUID()]);
    assert.equal(await runOnce(adapter, async () => { throw new Error('secret model details'); }), 'failed');
    const failed = (await db.query('select status,error from portfolio_import_jobs where id=$1',[failedId])).rows[0];
    assert.deepEqual(failed,{status:'failed',error:'IMPORT_FAILED'});
    await db.query("insert into portfolio_import_jobs(profile_id,request_id,kind,source_text,status,started_at) values($1,$2,'text','QA','processing',now()-interval '11 minutes')",[owner,crypto.randomUUID()]);
    await runOnce(adapter, async () => sample());
    assert.equal((await db.query("select count(*)::int as n from portfolio_import_jobs where error='PROCESSING_TIMEOUT'")).rows[0].n,1);
    const key = crypto.randomUUID(), dancer = crypto.randomUUID();
    for(let i=0;i<2;i++) await db.query("insert into careers(dancer_id,title,import_key) values($1,'QA',$2) on conflict(dancer_id,import_key) do nothing",[dancer,key]);
    assert.equal((await db.query('select * from careers')).rows.length,1);
  } finally { await db.close(); }
});

test('real subscription OAuth extraction of synthetic text', { skip: !process.env.PORTFOLIO_TEST_OAUTH }, async () => {
  const data = await extractPortfolio({ source_text: '활동명: QA Dancer\n2025년 3월 QA Festival 공연 댄서\nQA Battle 우승 (날짜 미상)' });
  assert.equal(data.profile.stage_name, 'QA Dancer');
  assert.equal(data.careers.length, 2);
  assert.equal(data.careers.find(c => c.type === 'performance')?.date, '2025-03-01');
  assert.equal(data.careers.find(c => /QA Battle/i.test(c.title))?.date, '');
});

function samplePdf() {
  const stream = 'BT /F1 14 Tf 50 740 Td (Stage name: QA Dancer) Tj 0 -24 Td (March 2025: QA Festival performance dancer) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('real subscription OAuth accepts PDF documents', { skip: !process.env.PORTFOLIO_TEST_OAUTH }, async () => {
  const data=await extractPortfolio({ source_text: '' },samplePdf());
  assert.equal(data.profile.stage_name,'QA Dancer');
  assert.equal(data.careers[0].date,'2025-03-01');
  assert.match(data.careers[0].title,/QA Festival/i);
});
