alter table public.interpreters
add column if not exists propio_interpreter_id text,
add column if not exists big_interpreter_id text,
add column if not exists equiti_voyce_id text,
add column if not exists equiti_martti_id text;
