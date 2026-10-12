const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
for (const hasAcquiredSnakeColumn of [true, false]) {
test(`review migrations preserve data and workflows (existing acquired_snake_id: ${hasAcquiredSnakeColumn})`,async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;
 create function can_edit_app() returns boolean language sql as $$select current_setting('app.editor',true)='yes'$$;set app.editor='yes';
 create table snakes(id text primary key);
 create table ai_recommendations(id bigint primary key,title text,summary text,proposal_payload jsonb,priority_score integer,status text,reviewed_at timestamptz,applied_at timestamptz);
 create table planning_scenarios(id bigint generated always as identity primary key,name text,scenario_type text,status text,planning_year integer,reviewed_at timestamptz,reviewed_by uuid);
 create table annual_breeding_plans(id bigint generated always as identity primary key,scenario_id bigint,plan_year integer,priority text,route_id text,project_name text,female_snake_id text,male_snake_id text,goal text,mode text,status text,planned_clutches integer,notes text,source_type text,review_status text,ai_recommendation_id bigint,submitted_at timestamptz,reviewed_at timestamptz);
 create table investments(id text primary key,name text,category text,status text,rank integer,strategic_score integer,target_sex text,planned_year integer,thesis text,criteria jsonb,notes text,source_type text,review_status text,ai_recommendation_id bigint,submitted_at timestamptz,reviewed_at timestamptz${hasAcquiredSnakeColumn ? ',acquired_snake_id text references snakes(id) on delete set null' : ''});
 insert into snakes(id) values('existing-snake');
 ${hasAcquiredSnakeColumn ? "insert into investments(id,acquired_snake_id) values('existing-investment','existing-snake');" : ''}
 insert into ai_recommendations(id,title,summary,proposal_payload,priority_score,status) values(1,'年度草案','待核实','{"action":"create_annual_plan","plan_year":2026,"planned_clutches":3}',80,'proposed'),(2,'投资草案','待核实','{}',60,'proposed');`);
 await db.exec(fs.readFileSync('supabase/migrations/037_audit_review_workflow.sql','utf8'));
 if (!hasAcquiredSnakeColumn) await db.exec("insert into investments(id,acquired_snake_id) values('existing-investment','existing-snake')");
 await db.exec('set role authenticated');
 const a=(await db.query("select submit_ai_business_review(1,'annual',2026) as id")).rows[0].id;
 assert.equal((await db.query("select submit_ai_business_review(1,'annual',2026) as id")).rows[0].id,a);
 await assert.rejects(db.query("select review_business_record('annual',$1,'returned','')",[a]),/原因/);
 await db.query("select review_business_record('annual',$1,'returned','亲本待核对')",[a]);
 await assert.rejects(db.query("select review_business_record('annual',$1,'approved','')",[a]),/状态已改变/);
 await db.query("select review_business_record('annual',$1,'pending','已更正')",[a]);
 await db.query("select review_business_record('annual',$1,'approved','')",[a]);
 await db.exec('reset role');
 assert.equal((await db.query('select status from planning_scenarios')).rows[0].status,'accepted');
 assert.equal((await db.query('select count(*) from business_review_history')).rows[0].count,3);
 assert.equal((await db.query('select status from ai_recommendations where id=1')).rows[0].status,'applied');
 // Re-running 037 must preserve existing links, foreign keys and review history.
 await db.exec(fs.readFileSync('supabase/migrations/037_audit_review_workflow.sql','utf8'));
 assert.equal((await db.query("select acquired_snake_id from investments where id='existing-investment'")).rows[0].acquired_snake_id,'existing-snake');
 assert.equal((await db.query('select count(*) from business_review_history')).rows[0].count,3);
 assert.equal((await db.query("select count(*) from pg_constraint where conrelid='investments'::regclass and contype='f' and confrelid='snakes'::regclass")).rows[0].count,1);
 await assert.rejects(db.exec("update investments set acquired_snake_id='missing-snake' where id='existing-investment'"),/foreign key/);
 await db.exec("delete from snakes where id='existing-snake'");
 assert.equal((await db.query("select acquired_snake_id from investments where id='existing-investment'")).rows[0].acquired_snake_id,null);
 await db.exec("select submit_ai_business_review(2,'investment',2026);delete from ai_recommendations where id=2");
 await assert.rejects(db.exec("select review_business_record('investment','AI-2','approved','')"),/Linked recommendation/);
 assert.equal((await db.query("select review_status from investments where id='AI-2'")).rows[0].review_status,'pending');
 await db.exec(`create table profiles(id uuid,active boolean,role text);insert into profiles values(auth.uid(),true,'admin');
 alter table snakes add column sex text,add column sire_id text,add column dam_id text,add column clutch_id bigint,add column birth_date date,add column origin text,add column status text,add column inventory_library text,add column series_names text[];
 create table clutches(id bigint primary key,female_snake_id text,male_snake_id text);
 create table snake_series(name text primary key);
 create table breeding_events(id bigint primary key);
 create function record_breeding_event(bigint,bigint,text,text,date,text,text) returns bigint language sql as $$select 1::bigint$$;
 create table ai_prompt_templates(id bigint generated always as identity primary key,template_key text,version integer,name text,analysis_type text,system_prompt text,response_schema_version text,is_active boolean);
 insert into ai_prompt_templates(template_key,version,name,analysis_type,system_prompt,response_schema_version,is_active) values('pair',1,'配对','pairing','旧提示词','v2',true);
 insert into snake_series values('unused'),('used');
 insert into snakes(id,sex,birth_date,status,inventory_library,series_names) values('M','M','2020-01-01','active','stock',array['used']),('F','F','2020-01-01','active','stock',array['used']);`);
 await db.exec(fs.readFileSync('supabase/migrations/038_audit_linked_records.sql','utf8'));
 await db.exec("select archive_snake_series('unused',true)");
 await assert.rejects(db.exec("select archive_snake_series('used',true)"),/仍有个体/);
 await assert.rejects(db.exec("update snakes set sire_id='M' where id='M'"),/自己的亲本/);
 await db.exec("insert into snakes(id,sex,sire_id,dam_id,birth_date) values('C','M','M','F','2025-01-01')");
 await assert.rejects(db.exec("update snakes set sire_id='C' where id='M'"),/循环/);
 const prompt='已核对遗传资料、已记录事实与未确认情况。'.repeat(8);
 assert.equal((await db.query('select save_prompt_version(1,$1) as v',[prompt])).rows[0].v,2);
 await assert.rejects(db.query('select save_prompt_version(1,$1)',[prompt]),/已被其他人更新/);
 assert.equal((await db.query('select count(*) from ai_prompt_templates where is_active')).rows[0].count,1);
 // Re-running 038 must retain archived series, history and prompt versions.
 await db.exec(fs.readFileSync('supabase/migrations/038_audit_linked_records.sql','utf8'));
 assert.equal((await db.query("select archived from snake_series where name='unused'")).rows[0].archived,true);
 assert.equal((await db.query('select count(*) from pedigree_history')).rows[0].count,1);
 assert.equal((await db.query('select version from ai_prompt_templates where is_active')).rows[0].version,2);
 await assert.rejects(db.exec("update snakes set sire_id='M' where id='M'"),/自己的亲本/);
 await db.exec("update snakes set sire_id=null where id='C'");
 assert.equal((await db.query('select count(*) from pedigree_history')).rows[0].count,2);
 await db.exec("set app.editor='no';set role authenticated");
 await assert.rejects(db.exec("select submit_ai_business_review(1,'annual',2026)"),/Not authorized/);
 }finally{await db.close();}
});
}
