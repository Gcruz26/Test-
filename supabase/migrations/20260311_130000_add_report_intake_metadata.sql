alter table public.report_intakes
  add column if not exists client_platform text,
  add column if not exists date_range_start date,
  add column if not exists date_range_end date;

update public.report_intakes
set
  client_platform = coalesce(
    client_platform,
    case
      when exists (
        select 1
        from public.clients c
        where c.id = report_intakes.client_id
          and c.name = 'BIG'
      ) then 'InterpVault'
      when exists (
        select 1
        from public.clients c
        where c.id = report_intakes.client_id
          and c.name = 'Equiti'
      ) then 'Voyce'
      else 'Propio Analytics'
    end
  ),
  date_range_start = coalesce(date_range_start, created_at::date),
  date_range_end = coalesce(date_range_end, created_at::date)
where client_platform is null
   or date_range_start is null
   or date_range_end is null;

alter table public.report_intakes
  alter column client_platform set not null,
  alter column date_range_start set not null,
  alter column date_range_end set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_intakes_date_range_check'
  ) then
    alter table public.report_intakes
      add constraint report_intakes_date_range_check
      check (date_range_end >= date_range_start);
  end if;
end $$;
