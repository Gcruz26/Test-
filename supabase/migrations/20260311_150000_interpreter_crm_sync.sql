alter table public.interpreters
  add column if not exists weekly text not null default '';

alter table public.interpreters
  alter column employee_id drop not null,
  alter column email drop not null;

alter type public.interpreter_status add value if not exists 'Fully Onboarded';
alter type public.interpreter_status add value if not exists 'Terminated';
alter type public.interpreter_status add value if not exists 'Deactived';
alter type public.interpreter_status add value if not exists 'Resigned';
