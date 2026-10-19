-- Read-only telemetry contract and per-level bindings. No vendor credentials/control.
begin;
do $$begin
 if to_regprocedure('public.room_validate_config_v049(jsonb)') is null then
  alter function public.room_validate_config(jsonb) rename to room_validate_config_v049;
 end if;
end$$;
create or replace function public.room_validate_config(p jsonb) returns void
language plpgsql set search_path=public as $$
declare c jsonb;l jsonb;e jsonb;b jsonb;k text;
begin
 perform public.room_validate_config_v049(p);
 for c in select value from jsonb_array_elements(p->'cabinets') loop
  for l in select value from jsonb_array_elements(c->'levels') loop
   if not l ? 'environment' then continue;end if;
   e:=l->'environment';
   if jsonb_typeof(e) is distinct from 'object' then raise exception '温湿度配置字段无效';end if;
   if exists(select 1 from jsonb_object_keys(e) key where key not in ('temperature','humidity')) then raise exception '温湿度配置字段无效';end if;
   foreach k in array array['temperature','humidity'] loop
    b:=e->k;if b is null or b='null'::jsonb then continue;end if;
    if jsonb_typeof(b) is distinct from 'object' then raise exception '温湿度来源无效';end if;
    if exists(select 1 from jsonb_object_keys(b) key where key not in ('provider','deviceId','channel','label','staleAfterSeconds')) then raise exception '温湿度来源字段无效';end if;
    if coalesce(b->>'provider','') not in ('davinci','home_assistant','mqtt','custom')
     or jsonb_typeof(b->'deviceId') is distinct from 'string' or length(trim(b->>'deviceId')) not between 1 and 200
     or jsonb_typeof(b->'channel') is distinct from 'string' or length(trim(b->>'channel')) not between 1 and 200
     or jsonb_typeof(b->'label') is distinct from 'string' or length(b->>'label')>80
     or jsonb_typeof(b->'staleAfterSeconds') is distinct from 'number' then raise exception '温湿度来源须填写设备、通道及有效期';end if;
    if (b->>'staleAfterSeconds')::numeric not between 30 and 86400 or trunc((b->>'staleAfterSeconds')::numeric)<>(b->>'staleAfterSeconds')::numeric then raise exception '数据有效期须为30–86400秒整数';end if;
   end loop;
  end loop;
 end loop;
end$$;
create or replace function public.room_environment_snapshot() returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg jsonb;c jsonb;l jsonb;rows jsonb:='[]';
begin
 if not coalesce(public.can_edit_app(),false) then raise exception 'editor required' using errcode='42501';end if;
 select config into cfg from public.room_workspace where id=1;
 for c in select value from jsonb_array_elements(cfg->'cabinets') loop
  for l in select value from jsonb_array_elements(c->'levels') loop
   rows:=rows||jsonb_build_array(jsonb_build_object('cabinetId',c->>'id','levelId',l->>'id',
    'temperature',jsonb_build_object('value',null,'unit','°C','observedAt',null,'status',case when coalesce(l->'environment'->'temperature','null')='null'::jsonb then 'unbound' else 'not_connected' end),
    'humidity',jsonb_build_object('value',null,'unit','%','observedAt',null,'status',case when coalesce(l->'environment'->'humidity','null')='null'::jsonb then 'unbound' else 'not_connected' end)));
  end loop;
 end loop;
 return jsonb_build_object('version',1,'capabilities',jsonb_build_object('read',true,'control',false,'connected',false),'levels',rows);
end$$;
revoke all on function public.room_validate_config(jsonb),public.room_validate_config_v049(jsonb),public.room_environment_snapshot() from public,anon,authenticated;
grant execute on function public.room_environment_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;
