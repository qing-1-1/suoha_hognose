begin;
create table public.snake_series(name text primary key check(length(btrim(name)) between 1 and 100 and name=btrim(name)));
alter table public.snake_series enable row level security;
grant select,insert on public.snake_series to authenticated;
create policy series_read on public.snake_series for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and active));
create policy series_write on public.snake_series for insert to authenticated with check(public.can_edit_app());
alter table public.snakes add column series_names text[];
update public.snakes set series_names=case when nullif(btrim(series),'') is null then '{}'::text[] else array[btrim(series)] end;
alter table public.snakes alter column series_names set not null;
alter table public.snakes alter column series_names set default '{}';
insert into public.snake_series select distinct unnest(series_names) from public.snakes on conflict do nothing;
create function public.sync_snake_series() returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Legacy import and hatchling writers still supply a single series string.
 if tg_op='INSERT' and cardinality(new.series_names)=0 and nullif(btrim(new.series),'') is not null then
   new.series_names:=array[btrim(new.series)];
 elsif tg_op='UPDATE' and new.series is distinct from old.series and new.series_names is not distinct from old.series_names then
   new.series_names:=case when nullif(btrim(new.series),'') is null then '{}'::text[] else array[btrim(new.series)] end;
 end if;
 select coalesce(array_agg(name order by name),'{}'::text[]) into new.series_names from (select distinct btrim(n) name from unnest(new.series_names) n where nullif(btrim(n),'') is not null) v;
 insert into public.snake_series select unnest(new.series_names) on conflict do nothing;
 new.series:=array_to_string(new.series_names,' / ');
 return new;
end $$;
create trigger sync_snake_series before insert or update of series,series_names on public.snakes for each row execute function public.sync_snake_series();
create function public.rename_snake_series(p_old text,p_new text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.can_edit_app() then raise exception 'Not authorized'; end if;
 p_new:=btrim(p_new);
 if p_new is null or length(p_new) not between 1 and 100 then raise exception 'Invalid series name'; end if;
 perform 1 from public.snake_series where name=p_old for update;
 if not found then raise exception 'Series not found'; end if;
 if p_new=p_old then return; end if;
 insert into public.snake_series values(p_new);
 update public.snakes set series_names=array_replace(series_names,p_old,p_new) where p_old=any(series_names);
 delete from public.snake_series where name=p_old;
end $$;
revoke all on function public.rename_snake_series(text,text) from public,anon;
grant execute on function public.rename_snake_series(text,text) to authenticated;
create or replace function public.public_catalog_v2(p_slug text default null, p_page integer default 1,
  p_search text default '', p_series text default '', p_sex text default '', p_status text default '', p_sort text default 'newest', p_year integer default null, p_gene text default '', p_gene_state text default '')
returns jsonb language sql stable security definer set search_path=public as $$
with eligible as (
  select l.*,s.series,s.sex,s.birth_date,s.gene_text from public.specimen_listings l join public.snakes s on s.id=l.snake_id
  where l.published and l.deleted_at is null
    and (p_year is null or (l.birth_precision<>'unknown' and extract(year from s.birth_date)=p_year))
    and (p_gene='' or exists(select 1 from public.snake_genes sg where sg.snake_id=s.id and sg.gene_id=p_gene and (p_gene_state='' or sg.state=p_gene_state)))
    and (p_slug is null or l.slug=p_slug)
    and (p_series='' or p_series=any(s.series_names)) and (p_sex='' or s.sex=p_sex) and (p_status='' or l.sale_status=p_status)
    and (p_search='' or l.title ilike '%'||left(p_search,100)||'%' or s.id ilike '%'||left(p_search,100)||'%'
      or s.gene_text ilike '%'||left(p_search,100)||'%')
), page as (
  select * from eligible order by
    case when p_sort='price_asc' then asking_price end asc nulls last,
    case when p_sort='price_desc' then asking_price end desc nulls last,
    featured desc,created_at desc,id
  limit 24 offset ((greatest(1,least(coalesce(p_page,1),10000))-1)*24)
)
select jsonb_build_object('total',(select count(*) from eligible),'page',greatest(1,coalesce(p_page,1)),
 'series',coalesce((select jsonb_agg(v.series order by v.series) from (select distinct unnest(s.series_names) series from public.specimen_listings l join public.snakes s on s.id=l.snake_id where l.published and l.deleted_at is null) v),'[]'::jsonb),
 'years',coalesce((select jsonb_agg(y order by y desc) from (select distinct extract(year from s.birth_date)::integer y from public.specimen_listings l join public.snakes s on s.id=l.snake_id where l.published and l.deleted_at is null and l.birth_precision<>'unknown' and s.birth_date is not null) v),'[]'::jsonb),
 'gene_options',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name_zh) order by v.id) from (select distinct g.id,g.name_zh from public.genes g join public.snake_genes sg on sg.gene_id=g.id join public.specimen_listings l on l.snake_id=sg.snake_id where l.published and l.deleted_at is null) v),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'slug',p.slug,'snake_id',p.snake_id,'title',p.title,'description',p.description,
   'series',p.series,'sex',p.sex,'birth',case p.birth_precision when 'day' then to_char(p.birth_date,'YYYY-MM-DD') when 'month' then to_char(p.birth_date,'YYYY-MM') when 'year' then to_char(p.birth_date,'YYYY') else null end,
   'gene_text',p.gene_text,'sale_status',p.sale_status,'asking_price',p.asking_price,'currency',p.currency,'featured',p.featured,
   'husbandry_summary',p.husbandry_summary,'pedigree_summary',p.pedigree_summary,
   'genes',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name_zh,'state',sg.state,'probability',sg.probability) order by g.id) from public.snake_genes sg join public.genes g on g.id=sg.gene_id where sg.snake_id=p.snake_id),'[]'::jsonb),
   'photos',coalesce((select jsonb_agg(jsonb_build_object('path',m.storage_path,'thumbnail_path',m.thumbnail_path,'caption',m.caption,'date',m.photographed_at) order by m.sort_order,m.created_at) from public.specimen_media m where m.listing_id=p.id and m.is_public),'[]'::jsonb)
 )) from page p),'[]'::jsonb));
$$;
revoke all on function public.public_catalog_v2(text,integer,text,text,text,text,text,integer,text,text) from public;
grant execute on function public.public_catalog_v2(text,integer,text,text,text,text,text,integer,text,text) to anon,authenticated,service_role;

commit;
notify pgrst,'reload schema';
