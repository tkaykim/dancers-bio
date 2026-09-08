begin;
-- A manual participant remains the identity owner when the confirmed board is synced later.
create function public.campaign_skip_manual_duplicate() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.manual_entry_id is null and exists(select 1 from public.campaign_participants p where p.project_id=new.project_id and p.manual_entry_id is not null and ((new.dancer_id is not null and p.dancer_id=new.dancer_id) or (new.ig_handle is not null and lower(p.ig_handle)=lower(new.ig_handle)))) then return null; end if;
 return new;
end $$;
revoke all on function public.campaign_skip_manual_duplicate() from public,anon,authenticated;
create trigger campaign_manual_sync_dedupe before insert on public.campaign_participants for each row execute function public.campaign_skip_manual_duplicate();
-- Older fee editors only know the total. Never retain contradictory structured terms after a total change.
create function public.campaign_fee_total_consistency() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.amount is distinct from new.amount and new.terms=old.terms then new.terms:='{}'; end if;
 return new;
end $$;
revoke all on function public.campaign_fee_total_consistency() from public,anon,authenticated;
create trigger campaign_fee_total_consistency before update on public.campaign_budget_fees for each row execute function public.campaign_fee_total_consistency();
commit;
