-- Allow 10–20 px labels on existing rooms without changing saved templates.
begin;
create or replace function public.room_validate_label_template(p jsonb) returns void
language plpgsql set search_path=public as $$
declare line jsonb; token text;
begin
 if p is null or p='null'::jsonb then return; end if;
 if jsonb_typeof(p)<>'object' or length(coalesce(p->>'name','')) not between 1 and 120
 or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 6
 or coalesce(p->>'fontSize','')!~ '^\d+$' or (p->>'fontSize')::integer not between 10 and 20
 or coalesce(p->>'align','') not in ('left','center','right') then raise exception '标签模板格式无效'; end if;
 for line in select value from jsonb_array_elements(p->'lines') loop
  if jsonb_typeof(line)<>'string' or length(line#>>'{}')>160 then raise exception '标签模板每行最多 160 字'; end if;
  for token in select (regexp_matches(line#>>'{}','\{\{([^{}]*)\}\}','g'))[1] loop
   if token not in ('id','sex','gene','weight','mouse','next','note') then raise exception '未知标签字段：%',token; end if;
  end loop;
  if regexp_replace(line#>>'{}','\{\{(id|sex|gene|weight|mouse|next|note)\}\}','','g') ~ '(\{\{|\}\})' then raise exception '标签字段格式无效'; end if;
 end loop;
end $$;
revoke all on function public.room_validate_label_template(jsonb) from public,anon,authenticated;
commit;
