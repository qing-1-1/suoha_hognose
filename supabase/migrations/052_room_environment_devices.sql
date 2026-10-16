-- Device catalog is stored in room config; layer bindings retain materialized values for existing readers.
begin;
do $$begin
 if to_regprocedure('public.room_validate_config_v051(jsonb)') is null then
  alter function public.room_validate_config(jsonb) rename to room_validate_config_v051;
 end if;
end$$;
create or replace function public.room_validate_config(p jsonb) returns void
language plpgsql set search_path=public as $$
declare clean jsonb:=p;devices jsonb:=coalesce(p->'environmentDevices','[]'::jsonb);d jsonb;c jsonb;l jsonb;b jsonb;expected jsonb;k text;ci integer;li integer;ids text[]:=array[]::text[];
begin
 if jsonb_typeof(devices) is distinct from 'array' then raise exception '设备列表格式无效';end if;
 if jsonb_array_length(devices)>100 then raise exception '设备列表最多100台';end if;
 for d in select value from jsonb_array_elements(devices) loop
  if jsonb_typeof(d) is distinct from 'object' then raise exception '设备参数无效';end if;
  if exists(select 1 from jsonb_object_keys(d) key where key not in ('id','provider','deviceId','label','staleAfterSeconds','temperatureChannel','humidityChannel')) then raise exception '设备参数字段无效';end if;
  if jsonb_typeof(d->'id') is distinct from 'string' or length(trim(d->>'id')) not between 1 and 200 or (d->>'id')=any(ids)
   or coalesce(d->>'provider','') not in ('davinci','tuya_cloud','home_assistant','mqtt','custom')
   or jsonb_typeof(d->'deviceId') is distinct from 'string' or length(trim(d->>'deviceId')) not between 1 and 200
   or jsonb_typeof(d->'label') is distinct from 'string' or length(trim(d->>'label')) not between 1 and 80
   or jsonb_typeof(d->'staleAfterSeconds') is distinct from 'number' then raise exception '设备参数无效或设备编号重复';end if;
  ids:=array_append(ids,d->>'id');
  if (d->>'staleAfterSeconds')::numeric not between 30 and 86400 or trunc((d->>'staleAfterSeconds')::numeric)<>(d->>'staleAfterSeconds')::numeric then raise exception '设备有效期无效';end if;
  foreach k in array array['temperatureChannel','humidityChannel'] loop
   if jsonb_typeof(d->k) is distinct from 'string' or length(d->>k)>200 or ((d->>k)<>'' and trim(d->>k)='') then raise exception '设备通道无效';end if;
  end loop;
  if d->>'temperatureChannel'='' and d->>'humidityChannel'='' then raise exception '至少填写一个设备通道';end if;
 end loop;
 for c,ci in select value,(ordinality-1)::integer from jsonb_array_elements(p->'cabinets') with ordinality loop
  for l,li in select value,(ordinality-1)::integer from jsonb_array_elements(c->'levels') with ordinality loop
   foreach k in array array['temperature','humidity'] loop
    b:=l->'environment'->k;if b is null or not(b?'sourceId') then continue;end if;
    select value into d from jsonb_array_elements(devices) where value->>'id'=b->>'sourceId';
    if d is null or coalesce(d->>(k||'Channel'),'')='' then raise exception '绑定设备或通道不存在';end if;
    expected:=jsonb_build_object('sourceId',d->>'id','provider',d->>'provider','deviceId',d->>'deviceId','channel',d->>(k||'Channel'),'label',d->>'label','staleAfterSeconds',d->'staleAfterSeconds');
    if b<>expected then raise exception '柜层设备参数与设备配置不一致';end if;
    clean:=jsonb_set(clean,array['cabinets',ci::text,'levels',li::text,'environment',k],b-'sourceId');
   end loop;
  end loop;
 end loop;
 perform public.room_validate_config_v051(clean-'environmentDevices');
end$$;
revoke all on function public.room_validate_config(jsonb),public.room_validate_config_v051(jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
