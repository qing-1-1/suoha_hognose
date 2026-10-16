-- Keep crop sources private. Public projections continue exposing only display files.
begin;
alter table public.specimen_media add column original_path text,add column crop jsonb;
alter table public.specimen_media add constraint specimen_original_path check(
 original_path is null or (split_part(original_path,'/',1)=listing_id::text and length(original_path) between 38 and 1024)
);
alter table public.specimen_media add constraint specimen_crop_object check(crop is null or jsonb_typeof(crop)='object');
commit;
notify pgrst,'reload schema';
