-- ═════════════════════════════════════════════════════════════════════════════
-- Migración 16: permisos mínimos en las tablas de la página de inicio
-- Supabase da todos los permisos a anon y authenticated en tablas nuevas. RLS ya
-- bloqueaba las escrituras; esto las cierra también a nivel de permisos.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

revoke all on public.landing_contenido, public.landing_banners, public.landing_videos from anon, authenticated;

grant select on public.landing_contenido, public.landing_banners, public.landing_videos to anon, authenticated;
grant update on public.landing_contenido to authenticated;
grant insert, update, delete on public.landing_banners, public.landing_videos to authenticated;

commit;
