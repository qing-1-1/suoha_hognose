const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('series migration preserves legacy values, normalizes memberships and renames atomically with authorization',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
 create table profiles(id uuid,active boolean);insert into profiles values(auth.uid(),true);
 create function can_edit_app() returns boolean language sql as $$select current_setting('app.editor',true)='yes'$$;
 create table snakes(id text primary key,series text);insert into snakes values('A','Red'),('B','Albino');
 grant select,insert,update on snakes to authenticated;set app.editor='yes';`);
 // Full catalog integration is exercised by database.test.js; isolate registry here.
 await db.exec(fs.readFileSync('supabase/migrations/035_snake_multiple_series.sql','utf8').split('create or replace function public.public_catalog_v2')[0]+'commit;');
 assert.deepEqual((await db.query("select series_names from snakes where id='A'")).rows[0].series_names,['Red']);
 await db.exec("update snakes set series_names=array['Red','Albino','Red'] where id='A'");
 assert.equal((await db.query("select series from snakes where id='A'")).rows[0].series,'Albino / Red');
 await db.exec("select rename_snake_series('Red','Scarlet')");
 assert.deepEqual((await db.query("select series_names from snakes where id='A'")).rows[0].series_names,['Albino','Scarlet']);
 await assert.rejects(db.exec("select rename_snake_series('Scarlet','Albino')"),/duplicate key/);
 assert.equal((await db.query("select count(*) from snakes where 'Scarlet'=any(series_names)")).rows[0].count,1);
 await db.exec("insert into snakes(id,series) values('C','Legacy')");
 assert.deepEqual((await db.query("select series_names from snakes where id='C'")).rows[0].series_names,['Legacy']);
 await db.exec("set app.editor='no';set role authenticated");
 await assert.rejects(db.exec("select rename_snake_series('Scarlet','Forbidden')"),/Not authorized/);
 await assert.rejects(db.exec("insert into snake_series values('Forbidden')"),/row-level security/);
 }finally{await db.close();}
});
