const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('photo crop migration preserves legacy originals and rejects cross-listing source references',async()=>{
 const db=new PGlite(),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';try{
  await db.exec('create table specimen_media(id integer primary key,listing_id uuid,storage_path text,thumbnail_path text,is_public boolean)');
  await db.query('insert into specimen_media values(1,$1,$2,null,true)',[id,id+'/legacy-photo.jpg']);
  await db.exec(fs.readFileSync('supabase/migrations/044_photo_crop_sources.sql','utf8'));
  const before=(await db.query('select * from specimen_media')).rows[0];assert.equal(before.original_path,null);assert.equal(before.is_public,true);
  await db.query('update specimen_media set original_path=storage_path,storage_path=$1,crop=$2',[id+'/cropped.webp',{x:10,y:20,w:300,h:300,ratio:1}]);
  assert.equal((await db.query('select original_path from specimen_media')).rows[0].original_path,id+'/legacy-photo.jpg');
  await assert.rejects(db.query("update specimen_media set original_path='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/private.webp'"),/specimen_original_path/);
  await assert.rejects(db.query("update specimen_media set crop='[]'::jsonb"),/specimen_crop_object/);
  await db.query('update specimen_media set storage_path=original_path,original_path=null,crop=null');
  assert.equal((await db.query('select storage_path from specimen_media')).rows[0].storage_path,id+'/legacy-photo.jpg');
 }finally{await db.close();}
});
