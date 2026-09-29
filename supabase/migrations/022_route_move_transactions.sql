begin;
create or replace function public.move_route_node(p_id text,p_x numeric,p_y numeric,p_expected_x numeric,p_expected_y numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare node public.route_nodes;
begin
  if not public.can_edit_app() then raise exception 'Not authorized'; end if;
  if p_x is null or p_y is null or p_x<0 or p_x>1000 or p_y<0 or p_y>650 then raise exception 'Position outside canvas'; end if;
  select * into node from public.route_nodes where id=p_id for update;
  if not found then raise exception 'Node no longer exists'; end if;
  if node.x is distinct from p_expected_x or node.y is distinct from p_expected_y then raise exception 'Node was moved by another session; refresh before retrying'; end if;
  update public.route_nodes set x=p_x,y=p_y where id=p_id;
  return jsonb_build_object('x',p_x,'y',p_y);
end $$;
revoke all on function public.move_route_node(text,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.move_route_node(text,numeric,numeric,numeric,numeric) to authenticated;
commit;
notify pgrst,'reload schema';
