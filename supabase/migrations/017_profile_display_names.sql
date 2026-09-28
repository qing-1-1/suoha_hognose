-- Known workspace user display names.
-- Run in Supabase SQL Editor after profiles have been created by Auth.

begin;

update public.profiles
set display_name = 'suohama',
    updated_at = now()
where lower(email) = '1442399241@qq.com';

update public.profiles
set display_name = 'suohayu',
    updated_at = now()
where lower(email) = '569850649@qq.com';

commit;
