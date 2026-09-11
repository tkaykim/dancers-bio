-- deetz UI 다국어 (docs/design-i18n-ui.md §4 M1·M2)
-- 운영 적용: 2026-09-11 (Supabase migration i18n_ui_profiles_preferred_lang_20260911)
-- 롤백:
--   drop trigger 재정의는 아래 함수를 이전 정의(id, display_name, phone 만 insert)로 교체
--   alter table public.profiles drop column preferred_lang;

-- M1: profiles.preferred_lang (ko | en | ja), nullable, additive
alter table public.profiles add column if not exists preferred_lang text;
alter table public.profiles drop constraint if exists profiles_preferred_lang_check;
alter table public.profiles add constraint profiles_preferred_lang_check
  check (preferred_lang is null or preferred_lang in ('ko','en','ja'));

-- M2: handle_new_user() — 기존 insert 열·on conflict 유지, preferred_lang 만 추가 (메타데이터가 ko/en/ja 일 때만)
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lang text := new.raw_user_meta_data->>'preferred_lang';
begin
  insert into public.profiles (id, display_name, phone, preferred_lang)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email,''), '@', 1),
      'User'
    ),
    nullif(new.raw_user_meta_data->>'phone', ''),
    case when v_lang in ('ko','en','ja') then v_lang else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
