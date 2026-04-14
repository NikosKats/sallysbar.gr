-- Super-admin role — sees everything admin sees + internal business pages.
-- Bootstrap: your email becomes super_admin.
update public.profiles
   set role = 'super_admin'
 where id in (select id from auth.users where lower(email) = 'nikolaos.katsilidis@gmail.com');
