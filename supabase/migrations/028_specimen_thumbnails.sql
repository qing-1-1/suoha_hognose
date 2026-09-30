-- Apply after 027. Thumbnails inherit their source photo's publication boundary.
begin;
alter table public.specimen_media add column thumbnail_path text unique;
alter table public.specimen_media add constraint specimen_thumbnail_path check (
 thumbnail_path is null or (thumbnail_path like listing_id::text || '/%' and thumbnail_path ~ '^[a-f0-9-]+/[a-f0-9-]+[.]webp$' and thumbnail_path <> storage_path)
);
create or replace function public.is_published_specimen_media(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.specimen_media m join public.specimen_listings l on l.id=m.listing_id
 where (m.storage_path=p_path or m.thumbnail_path=p_path) and m.is_public and l.published and l.deleted_at is null);
$$;
create or replace function public.public_catalog_v2(p_slug text default null, p_page integer default 1,
  p_search text default '', p_series text default '', p_sex text default '', p_status text default '', p_sort text default 'newest', p_year integer default null, p_gene text default '', p_gene_state text default '')
returns jsonb language sql stable security definer set search_path=public as $$
with eligible as (
  select l.*,s.series,s.sex,s.birth_date,s.gene_text from public.specimen_listings l join public.snakes s on s.id=l.snake_id
  where l.published and l.deleted_at is null
    and (p_year is null or (l.birth_precision<>'unknown' and extract(year from s.birth_date)=p_year))
    and (p_gene='' or exists(select 1 from public.snake_genes sg where sg.snake_id=s.id and sg.gene_id=p_gene and (p_gene_state='' or sg.state=p_gene_state)))
    and (p_slug is null or l.slug=p_slug)
    and (p_series='' or s.series=p_series) and (p_sex='' or s.sex=p_sex) and (p_status='' or l.sale_status=p_status)
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
 'series',coalesce((select jsonb_agg(v.series order by v.series) from (select distinct s.series from public.specimen_listings l join public.snakes s on s.id=l.snake_id where l.published and s.series is not null) v),'[]'::jsonb),
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
