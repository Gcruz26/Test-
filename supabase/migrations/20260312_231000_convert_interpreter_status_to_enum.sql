do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interpreters'
      and column_name = 'status'
      and udt_name <> 'interpreter_status'
  ) then
    alter table public.interpreters
      alter column status type public.interpreter_status
      using status::text::public.interpreter_status;
  end if;
end $$;
