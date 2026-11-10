-- The store of one source: what was fetched from it, and what the server derived.
-- It is a copy that can always be fetched again.

-- The events, the envelope in columns, the event's own fields in `payload` as they came
create table event (
    instance_id uuid not null,
    session_id uuid not null,
    id bigint not null,
    user_id bigint not null,
    -- The user who was really there, when a developer acted as `user_id`
    impersonator_id bigint,
    -- When the source stored the event, by its clock: what fetching goes by
    created_at timestamptz not null,
    -- When the browser reported it, by the browser's clock
    occurred_at timestamptz not null,
    seq integer not null,
    definition_revision integer not null,
    duration_ms integer generated always as (round((payload ->> 'durationMs')::numeric)::integer) stored,
    event_type text not null,
    view_id text not null,
    definition text not null,
    route text,
    app_version text,
    link_source text,
    payload jsonb not null,
    constraint event_pk primary key (id)
);

create index event_created_at on event (created_at);
create index event_definition_occurred_at on event (definition, occurred_at);
create index event_instance_id_seq on event (instance_id, seq);
create index event_user_id on event (user_id);

-- The ranges of `created_at` whose events were all fetched
create table coverage (
    kind text not null,
    ranges tstzmultirange not null default '{}',
    constraint coverage_pk primary key (kind)
);

insert into coverage (kind) values ('events');

-- A request to fetch, and how far it got
create table fetch_job (
    id bigint generated always as identity,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    pages integer not null default 0,
    rows integer not null default 0,
    kind text not null,
    state text not null default 'queued',
    error text,
    -- The period asked for, for events
    period tstzrange,
    constraint fetch_job_pk primary key (id),
    constraint fetch_job_kind_check check (kind in ('events', 'userData')),
    constraint fetch_job_state_check check (state in ('queued', 'running', 'done', 'failed'))
);

-- Users' stored DTV data, each revision as it was fetched: a history from the first fetch on
create table user_data (
    user_id bigint not null,
    revision bigint not null,
    fetched_at timestamptz not null,
    -- When the source changed the row, when it says
    updated_at timestamptz,
    data jsonb not null,
    constraint user_data_pk primary key (user_id, revision)
);

create view current_user_data as
select distinct on (user_id)
    user_id,
    revision,
    fetched_at,
    updated_at,
    data
from user_data
order by user_id asc, revision desc;

-- The names of the users in events and user data
create table app_user (
    id bigint not null,
    name text not null,
    constraint app_user_pk primary key (id)
);

-- The host's definitions, from the manifest the CLI writes
create table definition (
    revision integer not null,
    name text not null,
    -- Changes with the chain: what was derived with another one is derived again
    chain_hash text not null,
    projection jsonb not null,
    constraint definition_pk primary key (name)
);

-- A filter set in a `filtersApplied`, by its id at the current revision of its definition
create table filter_use (
    event_id bigint not null,
    -- The chain it was derived with; null when the host has no such definition
    chain_hash text,
    filter_id text not null,
    -- The filter was dropped from the definition since: `filter_id` is its id then
    removed boolean not null,
    constraint filter_use_pk primary key (event_id, filter_id),
    constraint filter_use_event_fk foreign key (event_id) references event (id) on delete cascade
);

-- What a user keeps for one view, in each revision of their user data
create table user_view_data (
    user_id bigint not null,
    revision bigint not null,
    -- The revision of the definition the data was written for
    definition_revision integer not null,
    rows_per_page integer,
    keeps_ordering boolean not null,
    keeps_filters boolean not null,
    view_id text not null,
    -- Null when the host has no definition for the view
    definition text,
    chain_hash text,
    ordering jsonb,
    hidden_columns text[] not null,
    column_order text[],
    -- The filters set in the state kept between visits, at the current revision
    kept_filters text[] not null,
    constraint user_view_data_pk primary key (user_id, revision, view_id),
    constraint user_view_data_user_data_fk foreign key (user_id, revision) references user_data (user_id, revision) on delete cascade
);

create table saved_filter (
    user_id bigint not null,
    revision bigint not null,
    created_at timestamptz,
    view_id text not null,
    id text not null,
    name text not null,
    -- The filters it sets, at the current revision
    filters text[] not null,
    constraint saved_filter_pk primary key (user_id, revision, view_id, id),
    constraint saved_filter_user_view_data_fk foreign key (user_id, revision, view_id)
    references user_view_data (user_id, revision, view_id) on delete cascade
);

-- User data DTV cannot read, and why
create table unreadable_user_data (
    user_id bigint not null,
    revision bigint not null,
    error text not null,
    constraint unreadable_user_data_pk primary key (user_id, revision),
    constraint unreadable_user_data_user_data_fk foreign key (user_id, revision) references user_data (user_id, revision) on delete cascade
);
