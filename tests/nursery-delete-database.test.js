const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('offspring deletion is authorized, atomic, and protects linked business records',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;
   create function can_edit_app() returns boolean language sql as $$select current_setting('app.editor',true)='yes'$$;
   create table snakes(id text primary key,inventory_library text,origin text,dam_id text,sire_id text);
   create table room_workspace(id int primary key);insert into room_workspace values(1);
   create table room_assignments(snake_id text);create table room_feeding_records(snake_id text);create table room_location_history(snake_id text);
   create table annual_breeding_plans(female_snake_id text,male_snake_id text);create table breeding_events(female_snake_id text,male_snake_id text);create table clutches(female_snake_id text,male_snake_id text);create table route_nodes(snake_id text);create table specimen_listings(id integer primary key,snake_id text,published boolean,sale_status text);
   create table specimen_media(listing_id integer references specimen_listings(id),storage_path text,thumbnail_path text,original_path text);
   create table purchase_inquiries(listing_id integer references specimen_listings(id));
   create table snake_genes(snake_id text references snakes(id));create table snake_measurements(snake_id text references snakes(id));
   create table external_history(snake_id text references snakes(id));
   insert into snakes values('A','nursery','produced',null,null),('B','stock','purchased',null,null),('C','stock','produced',null,null);
   insert into snake_genes values('A');insert into snake_measurements values('A');insert into external_history values('A');
   insert into specimen_listings values(1,'C',false,'display');insert into specimen_media values(1,'display.webp','thumb.webp','original.webp');insert into purchase_inquiries values(1);`);
  await db.exec(fs.readFileSync('supabase/migrations/045_delete_nursery_animal.sql','utf8'));
  await db.exec('set role anon');await assert.rejects(db.query("select delete_nursery_animal('A')"),/permission denied/);
  await db.exec('reset role;set role authenticated');await assert.rejects(db.query("select delete_nursery_animal('A')"),/Not authorized/);
  await db.exec("set app.editor='yes'");await assert.rejects(db.query("select delete_nursery_animal('B')"),/仅可/);
  await assert.rejects(db.query("select delete_nursery_animal('A')"),/原档案完整保留/);
  await db.exec('reset role');assert.equal((await db.query('select count(*) n from snake_genes')).rows[0].n,1);assert.equal((await db.query('select count(*) n from snake_measurements')).rows[0].n,1);
  await db.exec("delete from external_history;insert into room_assignments values('A');set role authenticated");await assert.rejects(db.query("select delete_nursery_animal('A')"),/移出/);
  await db.exec("reset role;delete from room_assignments;insert into annual_breeding_plans values('A','B');set role authenticated");await assert.rejects(db.query("select delete_nursery_animal('A')"),/关联/);
  await db.exec('reset role;delete from annual_breeding_plans;set role authenticated');await db.query("select delete_nursery_animal('A')");
  await assert.rejects(db.query("select delete_nursery_animal('C')"),/原档案完整保留/);
  await db.exec('reset role');assert.equal((await db.query('select count(*) n from specimen_media')).rows[0].n,1);await db.exec('delete from purchase_inquiries;set role authenticated');
  const removed=(await db.query("select delete_nursery_animal('C') data")).rows[0].data;assert.deepEqual(removed.removed_paths.sort(),['display.webp','original.webp','thumb.webp']);
  await db.exec('reset role');assert.deepEqual((await db.query('select id from snakes')).rows,[{id:'B'}]);assert.equal((await db.query('select count(*) n from snake_measurements')).rows[0].n,0);
 }finally{await db.close();}
});
