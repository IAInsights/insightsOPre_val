begin;

create schema if not exists reporting_validation;
revoke all on schema reporting_validation from public, anon;
grant usage on schema reporting_validation to authenticated;

create or replace function reporting_validation.club_avolta_submissions(p_from date, p_to date)
returns table (
  activity_date date,
  promoter_id bigint,
  source_promoter text,
  store_id bigint,
  source_store text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or right(lower(coalesce(auth.jwt() ->> 'email', '')), length('@globe-groupe.com')) <> '@globe-groupe.com' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 370 then
    raise exception 'Invalid reporting date range' using errcode = '22023';
  end if;

  return query
  select
    report.activity_date,
    report.promoter_id,
    report.source_promoter,
    report.store_id,
    report.source_store
  from public."ClubAvolta" as report
  where report.activity_date between p_from and p_to;
end;
$$;

revoke all on function reporting_validation.club_avolta_submissions(date, date)
  from public, anon, authenticated;
grant execute on function reporting_validation.club_avolta_submissions(date, date)
  to authenticated;

create or replace function public.club_avolta_submissions(p_from date, p_to date)
returns table (
  activity_date date,
  promoter_id bigint,
  source_promoter text,
  store_id bigint,
  source_store text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from reporting_validation.club_avolta_submissions(p_from, p_to)
$$;

revoke all on function public.club_avolta_submissions(date, date)
  from public, anon, authenticated;
grant execute on function public.club_avolta_submissions(date, date)
  to authenticated;

commit;
