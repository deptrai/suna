-- Ensure billing customers table exists in epsilon schema.
-- Needed by billing setup/checkout flows in cloud billing mode.

create schema if not exists epsilon;

create table if not exists epsilon.billing_customers (
  account_id uuid not null,
  id text primary key,
  email text,
  active boolean,
  provider text
);

create index if not exists idx_epsilon_billing_customers_account_id
  on epsilon.billing_customers(account_id);
