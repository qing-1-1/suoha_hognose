-- Requires 050. Credentials remain server-only. Commands are reserved before network I/O.
begin;
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
    if coalesce(b->>'provider','') not in ('davinci','tuya_cloud','home_assistant','mqtt','custom')
     or jsonb_typeof(b->'deviceId') is distinct from 'string' or length(trim(b->>'deviceId')) not between 1 and 200
     or jsonb_typeof(b->'channel') is distinct from 'string' or length(trim(b->>'channel')) not between 1 and 200
     or jsonb_typeof(b->'label') is distinct from 'string' or length(b->>'label')>80
     or jsonb_typeof(b->'staleAfterSeconds') is distinct from 'number' then raise exception '温湿度来源须填写设备、通道及有效期';end if;
    if (b->>'staleAfterSeconds')::numeric not between 30 and 86400 or trunc((b->>'staleAfterSeconds')::numeric)<>(b->>'staleAfterSeconds')::numeric then raise exception '数据有效期须为30–86400秒整数';end if;
   end loop;
  end loop;
 end loop;
end$$;

create table if not exists public.room_environment_commands(
 actor_id uuid not null references auth.users(id),request_id uuid not null,device_id text not null,payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','failed','unknown')),result jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(actor_id,request_id));
create index if not exists room_environment_commands_device on public.room_environment_commands(device_id,created_at desc);
alter table public.room_environment_commands enable row level security;
revoke all on public.room_environment_commands from public,anon,authenticated;
create or replace function public.room_environment_begin_command(p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare w public.room_workspace;old public.room_environment_commands;d text;
begin
 if not coalesce(public.can_edit_app(),false) then raise exception 'editor required' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid command';end if;
 if exists(select 1 from jsonb_object_keys(p_payload) key where key not in ('requestId','revision','deviceId','action','value')) or p_payload->>'requestId' is distinct from p_request::text then raise exception 'invalid command';end if;
 if p_payload->>'action' not in ('temperature','power') or p_payload->>'action' is null or not(p_payload?'value') then raise exception 'invalid command';end if;
 if (p_payload->>'action'='temperature' and jsonb_typeof(p_payload->'value') is distinct from 'number') or (p_payload->>'action'='power' and jsonb_typeof(p_payload->'value') is distinct from 'boolean') then raise exception 'invalid value';end if;
 select * into w from public.room_workspace where id=1 for update;
 select * into old from public.room_environment_commands where actor_id=auth.uid() and request_id=p_request;
 if found then if old.payload<>p_payload then raise exception 'request conflict';end if;return jsonb_build_object('execute',false,'status',old.status);end if;
 if w.revision is distinct from (p_payload->>'revision')::integer then raise exception 'room revision conflict';end if;
 d:=p_payload->>'deviceId';
 if not exists(select 1 from jsonb_array_elements(w.config->'cabinets') c,jsonb_array_elements(c->'levels') l where l->'environment'->'temperature'->>'provider' in ('davinci','tuya_cloud') and l->'environment'->'temperature'->>'deviceId'=d) then raise exception 'device not bound';end if;
 if exists(select 1 from public.room_environment_commands where device_id=d and status='pending' and created_at>now()-interval '60 seconds') then raise exception 'device busy';end if;
 insert into public.room_environment_commands(actor_id,request_id,device_id,payload) values(auth.uid(),p_request,d,p_payload);
 return jsonb_build_object('execute',true,'actor_id',auth.uid());
end$$;
create or replace function public.room_environment_finish_command(p_actor uuid,p_request uuid,p_result jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(p_result->>'status','') not in ('accepted','failed','unknown') then raise exception 'invalid outcome';end if;
 update public.room_environment_commands set status=p_result->>'status',result=p_result,updated_at=now() where actor_id=p_actor and request_id=p_request and status='pending';
end$$;
revoke all on function public.room_validate_config(jsonb),public.room_environment_begin_command(uuid,jsonb),public.room_environment_finish_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.room_environment_begin_command(uuid,jsonb) to authenticated;
grant execute on function public.room_environment_finish_command(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
