-- A contact-based WeChat transfer is independent of a QR payment channel.
-- Apply once after 030. The earlier QR settings and receipt history are retained.
begin;
alter table public.payment_channels drop constraint payment_channels_id_check;
alter table public.payment_channels add constraint payment_channels_id_check check(id in ('wechat_transfer','wechat','alipay','other'));
alter table public.payment_channels alter column qr_path drop not null;
alter table public.payment_channels add column wechat_id text;
alter table public.payment_channels add constraint payment_channel_destination check(
 (id='wechat_transfer' and length(btrim(coalesce(wechat_id,''))) between 1 and 100 and qr_path is null)
 or (id<>'wechat_transfer' and qr_path is not null and wechat_id is null)
);
drop function public.save_payment_channel(text,text,text,text,text,boolean);
create function public.save_payment_channel(p_id text,p_label text,p_payee text,p_instructions text,p_path text,p_enabled boolean,p_wechat_id text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not can_edit_app() then raise exception 'Not authorized'; end if;
 insert into payment_channels(id,label,payee,instructions,qr_path,enabled,wechat_id)
 values(p_id,btrim(p_label),btrim(p_payee),p_instructions,case when p_id='wechat_transfer' then null else p_path end,p_enabled,case when p_id='wechat_transfer' then btrim(p_wechat_id) else null end)
 on conflict(id) do update set label=excluded.label,payee=excluded.payee,instructions=excluded.instructions,qr_path=excluded.qr_path,enabled=excluded.enabled,wechat_id=excluded.wechat_id,updated_at=clock_timestamp();
end $$;
revoke all on function public.save_payment_channel(text,text,text,text,text,boolean,text) from public,anon;
grant execute on function public.save_payment_channel(text,text,text,text,text,boolean,text) to authenticated;

commit;
notify pgrst,'reload schema';
