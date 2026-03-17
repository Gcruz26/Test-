alter table public.interpreters
  add column if not exists weekly text not null default '';

alter table public.interpreters
  alter column employee_id drop not null,
  alter column email drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'interpreter_status'
  ) then
    create type public.interpreter_status as enum (
      'Active',
      'Inactive',
      'On Hold',
      'Fully Onboarded',
      'Terminated',
      'Deactivated',
      'Resigned'
    );
  end if;
end $$;

alter type public.interpreter_status add value if not exists 'Fully Onboarded';
alter type public.interpreter_status add value if not exists 'On Hold';
alter type public.interpreter_status add value if not exists 'Terminated';
alter type public.interpreter_status add value if not exists 'Deactivated';
alter type public.interpreter_status add value if not exists 'Resigned';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'interpreters'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.interpreters drop constraint %I', constraint_name);
  end loop;
end $$;
