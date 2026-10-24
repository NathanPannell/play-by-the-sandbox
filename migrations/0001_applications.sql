-- Creator and brand applications from /apply/creator and /apply/brand.
-- Every answer lives in `answers` (keyed by the field names in
-- src/apply/forms.js), so changing a form's fields needs no migration.
create table applications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('creator', 'brand')),
  name text not null,
  email text not null,
  answers jsonb not null,
  status text not null default 'new' check (status in ('new', 'shortlisted', 'declined')),
  -- HMAC of the sender's IP address, for rate limiting only.
  ip_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_created_at_idx on applications (created_at desc);
create index applications_ip_hash_idx on applications (ip_hash, created_at);

-- The optional photo, kept apart so listing applications never reads image bytes.
create table application_photos (
  application_id uuid primary key references applications (id) on delete cascade,
  content_type text not null,
  size integer not null,
  bytes bytea not null
);
