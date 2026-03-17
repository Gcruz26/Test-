begin;

insert into public.legal_entities (name, country)
values
  ('Alfa Systems LLC', 'United States'),
  ('Alfa Systems Cabo Verde', 'Cape Verde'),
  ('Inocore Senegal', 'Senegal')
on conflict (name) do update
set country = excluded.country;

insert into public.clients (name, code)
values
  ('Mercury Health Network', 'MERCURY'),
  ('NorthBridge Legal', 'NBRIDGE'),
  ('Sunrise Community Care', 'SUNRISE')
on conflict (name) do update
set code = excluded.code;

with seeded_interpreters as (
  select *
  from (
    values
      (
        'EMP-1001',
        'Maria Silva',
        'Maria',
        'Silva',
        'maria.silva@alfa.example.com',
        'Portuguese, English',
        'Praia',
        'Cape Verde',
        'Weekly',
        28.50::numeric(12,2),
        'Active',
        'Alfa Systems Cabo Verde',
        'MERCURY'
      ),
      (
        'EMP-1002',
        'James Carter',
        'James',
        'Carter',
        'james.carter@alfa.example.com',
        'English, Spanish',
        'Boston',
        'United States',
        'Biweekly',
        34.00::numeric(12,2),
        'Active',
        'Alfa Systems LLC',
        'NBRIDGE'
      ),
      (
        'EMP-1003',
        'Awa Ndiaye',
        'Awa',
        'Ndiaye',
        'awa.ndiaye@inocore.example.com',
        'French, Wolof, English',
        'Dakar',
        'Senegal',
        'Monthly',
        22.75::numeric(12,2),
        'On Hold',
        'Inocore Senegal',
        'SUNRISE'
      )
  ) as t(
    employee_id,
    full_name,
    first_name,
    last_name,
    email,
    language,
    location,
    country,
    payment_frequency,
    rate,
    status,
    legal_entity_name,
    client_code
  )
)
insert into public.interpreters (
  legal_entity_id,
  client_id,
  employee_id,
  full_name,
  first_name,
  last_name,
  email,
  language,
  location,
  country,
  payment_frequency,
  rate,
  status
)
select
  le.id,
  c.id,
  si.employee_id,
  si.full_name,
  si.first_name,
  si.last_name,
  si.email,
  si.language,
  si.location,
  si.country,
  si.payment_frequency::public.payment_frequency,
  si.rate,
  si.status::public.interpreter_status
from seeded_interpreters si
join public.legal_entities le on le.name = si.legal_entity_name
join public.clients c on c.code = si.client_code
on conflict (employee_id) do update
set
  legal_entity_id = excluded.legal_entity_id,
  client_id = excluded.client_id,
  full_name = excluded.full_name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  language = excluded.language,
  location = excluded.location,
  country = excluded.country,
  payment_frequency = excluded.payment_frequency,
  rate = excluded.rate,
  status = excluded.status;

with seeded_client_ids as (
  select *
  from (
    values
      ('maria.silva@alfa.example.com', 'MERCURY', 'CV-INT-1001'),
      ('james.carter@alfa.example.com', 'NBRIDGE', 'US-INT-2044'),
      ('awa.ndiaye@inocore.example.com', 'SUNRISE', 'SN-INT-3155')
  ) as t(email, client_code, external_id)
)
insert into public.interpreter_client_ids (interpreter_id, client_id, external_id)
select
  i.id,
  c.id,
  sci.external_id
from seeded_client_ids sci
join public.interpreters i on i.email = sci.email
join public.clients c on c.code = sci.client_code
on conflict (interpreter_id, client_id) do update
set external_id = excluded.external_id;

with seeded_mapping_configs as (
  select *
  from (
    values
      (
        'MERCURY',
        'Mercury',
        'Monthly Billing',
        jsonb_build_object(
          'service_date', jsonb_build_array('DOS', 'Date of Service', 'service_date'),
          'interpreter_name', jsonb_build_array('Interpreter', 'Provider Name'),
          'external_interpreter_id', jsonb_build_array('Interpreter ID', 'provider_id'),
          'minutes', jsonb_build_array('Minutes', 'Duration Minutes'),
          'hours', jsonb_build_array('Hours'),
          'rate', jsonb_build_array('Rate', 'Hourly Rate'),
          'amount', jsonb_build_array('Total', 'Amount'),
          'location', jsonb_build_array('Location', 'Department'),
          'currency', jsonb_build_array('Currency', 'Currency Code')
        )
      ),
      (
        'NBRIDGE',
        'NorthBridge',
        'Interpreter Payroll',
        jsonb_build_object(
          'service_date', jsonb_build_array('service date', 'date'),
          'interpreter_name', jsonb_build_array('name', 'interpreter_name'),
          'external_interpreter_id', jsonb_build_array('external id', 'interpreter id'),
          'minutes', jsonb_build_array('mins', 'minutes'),
          'hours', jsonb_build_array('hours', 'duration_hours'),
          'rate', jsonb_build_array('unit_rate', 'rate'),
          'amount', jsonb_build_array('line_total', 'amount'),
          'location', jsonb_build_array('site', 'location'),
          'currency', jsonb_build_array('curr', 'currency')
        )
      )
  ) as t(client_code, source_platform, report_type, field_aliases)
)
insert into public.client_mapping_configs (client_id, source_platform, report_type, field_aliases, is_active)
select
  c.id,
  smc.source_platform,
  smc.report_type,
  smc.field_aliases,
  true
from seeded_mapping_configs smc
join public.clients c on c.code = smc.client_code
on conflict (client_id, source_platform, report_type) do update
set
  field_aliases = excluded.field_aliases,
  is_active = excluded.is_active;

with seeded_routing_rules as (
  select *
  from (
    values
      ('MERCURY', 'Cabo Verde to Alfa CV', 'location = Cabo Verde', 'Alfa Systems Cabo Verde', null),
      ('MERCURY', 'Senegal to Inocore', 'location = Senegal', 'Inocore Senegal', null),
      ('MERCURY', 'Fallback to Alfa US', null, 'Alfa Systems LLC', null),
      ('NBRIDGE', 'Cabo Verde to Alfa CV', 'location = Cabo Verde', 'Alfa Systems Cabo Verde', 'Invoice'),
      ('NBRIDGE', 'Senegal to Inocore', 'location = Senegal', 'Inocore Senegal', 'Invoice'),
      ('NBRIDGE', 'Fallback to Alfa US', null, 'Alfa Systems LLC', 'Invoice'),
      ('SUNRISE', 'Cabo Verde to Alfa CV', 'location = Cabo Verde', 'Alfa Systems Cabo Verde', 'Bill'),
      ('SUNRISE', 'Senegal to Inocore', 'location = Senegal', 'Inocore Senegal', 'Bill'),
      ('SUNRISE', 'Fallback to Alfa US', null, 'Alfa Systems LLC', 'Bill')
  ) as t(client_code, rule_name, conditions, legal_entity_name, destination)
)
insert into public.routing_rules (client_id, legal_entity_id, rule_name, conditions, destination, is_active)
select
  c.id,
  le.id,
  srr.rule_name,
  srr.conditions,
  srr.destination,
  true
from seeded_routing_rules srr
join public.clients c on c.code = srr.client_code
join public.legal_entities le on le.name = srr.legal_entity_name
on conflict (client_id, rule_name) do update
set
  legal_entity_id = excluded.legal_entity_id,
  conditions = excluded.conditions,
  destination = excluded.destination,
  is_active = excluded.is_active;

commit;
