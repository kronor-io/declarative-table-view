-- What the app shows, computed from the stored events when it asks. Every function takes a
-- scope: the events that occurred from `period_from` until before `period_to`, of one
-- definition or one user when given, and those of impersonated users only when asked.

-- The events of a scope
create function scoped_events(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean,
    p_definition text,
    p_user_id bigint
)
returns setof event
language sql stable
as $$
    select * from event
    where occurred_at >= period_from and occurred_at < period_to
        and (with_impersonated or impersonator_id is null)
        and (p_definition is null or definition = p_definition)
        and (p_user_id is null or user_id = p_user_id)
$$;

-- One mounted table: its events by `instance_id`
create view instance as
select
    e.instance_id,
    (array_agg(e.session_id))[1] as session_id,
    min(e.user_id) as user_id,
    min(e.impersonator_id) as impersonator_id,
    min(e.occurred_at) as started_at,
    min(e.occurred_at) filter (where e.event_type = 'viewUnmounted') as unmounted_at,
    max(e.occurred_at) as last_at,
    count(*) as events,
    -- Gaps in `seq`: events lost on the way
    max(e.seq) - count(distinct e.seq) as lost_events,
    min(e.definition) as definition,
    min(e.view_id) as view_id,
    bool_or((e.payload ->> 'popout')::boolean) filter (where e.event_type = 'viewMounted') as popout
from event as e
group by e.instance_id;

-- The shape of `definition_stats`, for Hasura: it has no rows of its own
create table definition_stats_row (
    first_seen timestamptz,
    last_at timestamptz,
    p50_fetch_ms double precision,
    p95_fetch_ms double precision,
    median_time_on_view_ms double precision,
    users integer not null,
    sessions integer not null,
    mounts integer not null,
    popouts integer not null,
    view_ids integer not null,
    filters_applied integer not null,
    -- Applications that set at least one filter
    filtered_applications integer not null,
    filter_panel_opens integer not null,
    fetches integer not null,
    failed_fetches integer not null,
    lost_events integer not null,
    -- Instances without a `viewUnmounted`: time on view is cut short for them
    cut_short integer not null,
    -- False for a definition in the events that the host does not have
    known boolean not null,
    -- Used, but no application set a filter: e.g. a table on a record's page
    filters_never_set boolean not null,
    definition text not null
);

-- Per definition: how much it was used, how fast and how well. Without a user, every
-- definition the host has gets a row, those nobody used too.
create function definition_stats(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_user_id bigint default null
)
returns setof definition_stats_row
language sql stable
as $$
    with events as (
        select * from scoped_events(period_from, period_to, with_impersonated, null, p_user_id)
    ),

    instances as (
        select
            instance_id,
            min(definition) as definition,
            max(seq) - count(distinct seq) as lost_events,
            min(occurred_at) filter (where event_type = 'viewMounted') as mounted_at,
            min(occurred_at) filter (where event_type = 'viewUnmounted') as unmounted_at,
            max(occurred_at) as last_at
        from events
        group by instance_id
    ),

    by_instance as (
        select
            definition,
            sum(lost_events)::integer as lost_events,
            percentile_cont(0.5) within group (
                order by extract(epoch from coalesce(unmounted_at, last_at) - mounted_at) * 1000
            ) filter (where mounted_at is not null) as median_time_on_view_ms,
            count(*) filter (where mounted_at is not null and unmounted_at is null)::integer as cut_short
        from instances
        group by definition
    ),

    by_event as (
        select
            definition,
            max(occurred_at) as last_at,
            count(distinct user_id)::integer as users,
            count(distinct session_id)::integer as sessions,
            count(distinct view_id)::integer as view_ids,
            count(*) filter (where event_type = 'viewMounted')::integer as mounts,
            count(*) filter (where event_type = 'viewMounted' and (payload ->> 'popout')::boolean)::integer as popouts,
            count(*) filter (where event_type = 'filtersApplied')::integer as filters_applied,
            count(*) filter (where event_type = 'filtersApplied' and payload -> 'filters' <> '{}'::jsonb)::integer as filtered_applications,
            count(*) filter (
                where event_type = 'panelShown' and payload ->> 'panel' = 'filters' and (payload ->> 'shown')::boolean
            )::integer as filter_panel_opens,
            count(*) filter (where event_type = 'fetch')::integer as fetches,
            count(*) filter (where event_type = 'fetch' and payload ->> 'outcome' = 'failed')::integer as failed_fetches,
            percentile_cont(0.5) within group (order by duration_ms)
                filter (where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded') as p50_fetch_ms,
            percentile_cont(0.95) within group (order by duration_ms)
                filter (where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded') as p95_fetch_ms
        from events
        group by definition
    ),

    names as (
        select name as definition from definition where p_user_id is null
        union
        select definition from by_event
    )

    select
        (select min(e.occurred_at) from event as e where e.definition = n.definition),
        b.last_at,
        b.p50_fetch_ms,
        b.p95_fetch_ms,
        i.median_time_on_view_ms,
        coalesce(b.users, 0),
        coalesce(b.sessions, 0),
        coalesce(b.mounts, 0),
        coalesce(b.popouts, 0),
        coalesce(b.view_ids, 0),
        coalesce(b.filters_applied, 0),
        coalesce(b.filtered_applications, 0),
        coalesce(b.filter_panel_opens, 0),
        coalesce(b.fetches, 0),
        coalesce(b.failed_fetches, 0),
        coalesce(i.lost_events, 0),
        coalesce(i.cut_short, 0),
        exists (select from definition as d where d.name = n.definition),
        coalesce(b.mounts, 0) > 0 and coalesce(b.filtered_applications, 0) = 0,
        n.definition
    from names as n
    left join by_event as b on b.definition = n.definition
    left join by_instance as i on i.definition = n.definition
$$;

-- The shape of `period_stats`, for Hasura
create table period_stats_row (
    p95_fetch_ms double precision,
    median_time_on_view_ms double precision,
    events integer not null,
    users integer not null,
    sessions integer not null,
    mounts integer not null,
    definitions integer not null,
    filters_applied integer not null,
    fetches integer not null,
    failed_fetches integer not null,
    lost_events integer not null
);

-- The whole scope at once: what `definition_stats` cannot add up, such as users of several definitions
create function period_stats(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_definition text default null,
    p_user_id bigint default null
)
returns setof period_stats_row
language sql stable
as $$
    with events as (
        select * from scoped_events(period_from, period_to, with_impersonated, p_definition, p_user_id)
    ),

    instances as (
        select
            max(seq) - count(distinct seq) as lost,
            min(occurred_at) filter (where event_type = 'viewMounted') as mounted_at,
            coalesce(min(occurred_at) filter (where event_type = 'viewUnmounted'), max(occurred_at)) as ended_at
        from events
        group by instance_id
    )

    select
        percentile_cont(0.95) within group (order by duration_ms)
            filter (where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded'),
        (select percentile_cont(0.5) within group (order by extract(epoch from ended_at - mounted_at) * 1000)
            from instances where mounted_at is not null),
        count(*)::integer,
        count(distinct user_id)::integer,
        count(distinct session_id)::integer,
        count(*) filter (where event_type = 'viewMounted')::integer,
        count(distinct definition)::integer,
        count(*) filter (where event_type = 'filtersApplied')::integer,
        count(*) filter (where event_type = 'fetch')::integer,
        count(*) filter (where event_type = 'fetch' and payload ->> 'outcome' = 'failed')::integer,
        (select coalesce(sum(lost), 0)::integer from instances)
    from events
$$;

-- The shape of `activity_daily`, for Hasura
create table daily_row (
    day date not null,
    p50_fetch_ms double precision,
    p95_fetch_ms double precision,
    users integer not null,
    sessions integer not null,
    mounts integer not null,
    fetches integer not null,
    failed_fetches integer not null
);

-- Per day of the scope in `time_zone`, every day of it, those without events too
create function activity_daily(
    period_from timestamptz,
    period_to timestamptz,
    time_zone text,
    with_impersonated boolean default false,
    p_definition text default null,
    p_user_id bigint default null
)
returns setof daily_row
language sql stable
as $$
    with events as (
        select *, (occurred_at at time zone time_zone)::date as day
        from scoped_events(period_from, period_to, with_impersonated, p_definition, p_user_id)
    ),

    days as (
        select generate_series(
            (period_from at time zone time_zone)::date,
            ((period_to - interval '1 microsecond') at time zone time_zone)::date,
            interval '1 day'
        )::date as day
    ),

    by_day as (
        select
            day,
            percentile_cont(0.5) within group (order by duration_ms)
                filter (where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded') as p50,
            percentile_cont(0.95) within group (order by duration_ms)
                filter (where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded') as p95,
            count(distinct user_id)::integer as users,
            count(distinct session_id)::integer as sessions,
            count(*) filter (where event_type = 'viewMounted')::integer as mounts,
            count(*) filter (where event_type = 'fetch')::integer as fetches,
            count(*) filter (where event_type = 'fetch' and payload ->> 'outcome' = 'failed')::integer as failed
        from events
        group by day
    )

    select
        d.day,
        b.p50,
        b.p95,
        coalesce(b.users, 0),
        coalesce(b.sessions, 0),
        coalesce(b.mounts, 0),
        coalesce(b.fetches, 0),
        coalesce(b.failed, 0)
    from days as d
    left join by_day as b on b.day = d.day
    order by d.day
$$;

-- The shape of `breakdown`, for Hasura
create table breakdown_row (
    count integer not null,
    users integer not null,
    kind text not null,
    key text not null
);

-- Counts of the scope's events by what they say, one `kind` at a time:
--   trigger        the triggers of all `filtersApplied`
--   linkSource     what made the links tables opened with
--   fetchReason    why rows were requested
--   fetchOutcome   how requests ended
--   fetchError     the failures of requests, by kind and message
--   ordering       what users sorted by
--   rowsPerPage    the rows per page users picked
--   panel          the panels users opened
--   action         the actions run, and how they ended
--   problem        user data problems and failed suggestions
--   eventType      all events, by type
--   dtvVersion     sessions by DTV version
--   appVersion     sessions by the app's version
--   filterSearch   what users searched for among the filters
--   aiPrompt       what users asked the AI assistant, and how it ended
--   previousView   the views users switched from
create function breakdown(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_definition text default null,
    p_user_id bigint default null
)
returns setof breakdown_row
language sql stable
as $$
    with events as (
        select * from scoped_events(period_from, period_to, with_impersonated, p_definition, p_user_id)
    ),

    keyed as (
        select 'trigger' as kind, payload ->> 'trigger' as key, user_id from events where event_type = 'filtersApplied'
        union all
        select 'linkSource', link_source, user_id from events where link_source is not null
        union all
        select 'fetchReason', payload ->> 'reason', user_id from events where event_type = 'fetch'
        union all
        select 'fetchOutcome', payload ->> 'outcome', user_id from events where event_type = 'fetch'
        union all
        select 'fetchError', coalesce(payload -> 'error' ->> 'kind', 'unknown') || ': ' || left(coalesce(payload -> 'error' ->> 'message', ''), 200), user_id
        from events where event_type = 'fetch' and payload ->> 'outcome' = 'failed'
        union all
        select 'ordering', coalesce((payload -> 'ordering' ->> 'field') || ' ' || (payload -> 'ordering' ->> 'direction'), 'the view''s own'), user_id
        from events where event_type = 'orderingChanged'
        union all
        select 'rowsPerPage', payload ->> 'rowsPerPage', user_id from events where event_type = 'rowsPerPageChanged'
        union all
        select 'panel', payload ->> 'panel', user_id from events where event_type = 'panelShown' and (payload ->> 'shown')::boolean
        union all
        select 'action', (payload ->> 'action') || ' (' || (payload ->> 'outcome') || ')', user_id from events where event_type = 'action'
        union all
        select 'problem', event_type, user_id from events
        where event_type in ('userDataSaveFailed', 'userDataConflict', 'userDataReadOnly', 'filtersChangedSinceSnapshot', 'suggestionsFailed')
        union all
        select 'eventType', event_type, user_id from events
        union all
        select 'dtvVersion', payload ->> 'dtvVersion', user_id from events where event_type = 'sessionStarted'
        union all
        select 'appVersion', app_version, user_id from events where event_type = 'sessionStarted' and app_version is not null
        union all
        select 'filterSearch', payload ->> 'query', user_id from events where event_type = 'filterSearch'
        union all
        select 'aiPrompt', (payload ->> 'prompt') || ' (' || (payload ->> 'outcome') || ')', user_id from events where event_type = 'aiFilter'
        union all
        select 'previousView', payload ->> 'previousViewId', user_id from events where event_type = 'viewSelected'
    )

    select count(*)::integer, count(distinct user_id)::integer, kind, coalesce(key, 'none')
    from keyed
    group by kind, key
    order by kind, count(*) desc
$$;

-- The shape of `fetch_durations`, for Hasura
create table duration_row (
    min_ms double precision,
    p25_ms double precision,
    p50_ms double precision,
    p75_ms double precision,
    p95_ms double precision,
    max_ms double precision,
    fetches integer not null,
    reason text not null
);

-- How long the scope's successful requests took, by why they were made
create function fetch_durations(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_definition text default null,
    p_user_id bigint default null
)
returns setof duration_row
language sql stable
as $$
    select
        min(duration_ms),
        percentile_cont(0.25) within group (order by duration_ms),
        percentile_cont(0.5) within group (order by duration_ms),
        percentile_cont(0.75) within group (order by duration_ms),
        percentile_cont(0.95) within group (order by duration_ms),
        max(duration_ms),
        count(*)::integer,
        payload ->> 'reason'
    from scoped_events(period_from, period_to, with_impersonated, p_definition, p_user_id)
    where event_type = 'fetch' and payload ->> 'outcome' = 'succeeded' and duration_ms is not null
    group by payload ->> 'reason'
    order by count(*) desc
$$;

-- What each user keeps for a view, in their latest user data
create view current_user_view_data as
select v.*
from user_view_data as v
join current_user_data as c on c.user_id = v.user_id and c.revision = v.revision;

-- The shape of `filter_stats`, for Hasura
create table filter_stats_row (
    applications integer not null,
    users integer not null,
    -- Users who keep it set between visits, and saved filters that set it, in their latest user data
    kept_by integer not null,
    in_saved_filters integer not null,
    -- Dropped from the definition since it was used
    removed boolean not null,
    -- A filter of the definition now: one with no applications was not used
    in_definition boolean not null,
    filter_id text not null
);

-- Per filter of a definition: how often the scope's applications set it, and what users keep.
-- The definition's current filters get a row, those nobody set too.
create function filter_stats(
    p_definition text,
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false
)
returns setof filter_stats_row
language sql stable
as $$
    with applied as (
        select f.filter_id, f.removed, e.user_id
        from scoped_events(period_from, period_to, with_impersonated, p_definition, null) as e
        join filter_use as f on f.event_id = e.id
        where e.event_type = 'filtersApplied'
    ),

    current_filters as (
        select jsonb_object_keys(projection -> 'filters') as filter_id from definition where name = p_definition
    ),

    kept as (
        select unnest(kept_filters) as filter_id, user_id
        from current_user_view_data where definition = p_definition and keeps_filters
    ),

    saved as (
        select unnest(s.filters) as filter_id
        from saved_filter as s
        join current_user_view_data as v on v.user_id = s.user_id and v.revision = s.revision and v.view_id = s.view_id
        where v.definition = p_definition
    ),

    ids as (
        select filter_id from current_filters
        union
        select filter_id from applied
    )

    select
        (select count(*) from applied as a where a.filter_id = i.filter_id)::integer,
        (select count(distinct a.user_id) from applied as a where a.filter_id = i.filter_id)::integer,
        (select count(distinct k.user_id) from kept as k where k.filter_id = i.filter_id)::integer,
        (select count(*) from saved as s where s.filter_id = i.filter_id)::integer,
        coalesce((select bool_or(a.removed) from applied as a where a.filter_id = i.filter_id), false),
        exists (select from current_filters as c where c.filter_id = i.filter_id),
        i.filter_id
    from ids as i
$$;

-- The shape of `column_stats`, for Hasura
create table column_stats_row (
    hidden_by integer not null,
    -- Users with data for the definition: who could have hidden it
    users_with_data integer not null,
    in_definition boolean not null,
    column_id text not null
);

-- Per column of a definition: how many users hide it, in their latest user data
create function column_stats(p_definition text)
returns setof column_stats_row
language sql stable
as $$
    with views as (
        select * from current_user_view_data where definition = p_definition
    ),

    current_columns as (
        select jsonb_object_keys(projection -> 'columns') as column_id from definition where name = p_definition
    ),

    hidden as (
        select unnest(hidden_columns) as column_id, user_id from views
    ),

    ids as (
        select column_id from current_columns
        union
        select column_id from hidden
    )

    select
        (select count(distinct h.user_id) from hidden as h where h.column_id = i.column_id)::integer,
        (select count(distinct user_id) from views)::integer,
        exists (select from current_columns as c where c.column_id = i.column_id),
        i.column_id
    from ids as i
$$;

-- The shape of `slow_filter_sets`, for Hasura
create table filter_set_row (
    p50_ms double precision,
    p95_ms double precision,
    fetches integer not null,
    failed_fetches integer not null,
    filters text not null
);

-- The filters requests of a definition were made with: each request's `filtersApplied`
-- through `filtersSeq`, and the filters it set
create function slow_filter_sets(
    p_definition text,
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false
)
returns setof filter_set_row
language sql stable
as $$
    with fetches as (
        select f.instance_id, f.duration_ms, f.payload ->> 'outcome' as outcome, (f.payload ->> 'filtersSeq')::integer as filters_seq
        from scoped_events(period_from, period_to, with_impersonated, p_definition, null) as f
        where f.event_type = 'fetch'
    ),

    with_filters as (
        select
            f.*,
            coalesce((
                select string_agg(u.filter_id, ', ' order by u.filter_id)
                from event as a
                join filter_use as u on u.event_id = a.id
                where a.instance_id = f.instance_id and a.seq = f.filters_seq
            ), 'none') as filters
        from fetches as f
    )

    select
        percentile_cont(0.5) within group (order by duration_ms) filter (where outcome = 'succeeded'),
        percentile_cont(0.95) within group (order by duration_ms) filter (where outcome = 'succeeded'),
        count(*)::integer,
        count(*) filter (where outcome = 'failed')::integer,
        filters
    from with_filters
    group by filters
$$;

-- The shape of `user_stats`, for Hasura
create table user_stats_row (
    user_id bigint not null,
    last_at timestamptz,
    sessions integer not null,
    mounts integer not null,
    definitions integer not null,
    filters_applied integer not null,
    fetches integer not null,
    failed_fetches integer not null,
    saved_filters integer not null,
    name text
);

-- Per user of the scope: how much they used it, and what they keep
create function user_stats(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_definition text default null
)
returns setof user_stats_row
language sql stable
as $$
    select
        e.user_id,
        max(e.occurred_at),
        count(distinct e.session_id)::integer,
        count(*) filter (where e.event_type = 'viewMounted')::integer,
        count(distinct e.definition)::integer,
        count(*) filter (where e.event_type = 'filtersApplied')::integer,
        count(*) filter (where e.event_type = 'fetch')::integer,
        count(*) filter (where e.event_type = 'fetch' and e.payload ->> 'outcome' = 'failed')::integer,
        (select count(*) from saved_filter as s
            join current_user_view_data as v on v.user_id = s.user_id and v.revision = s.revision and v.view_id = s.view_id
            where s.user_id = e.user_id and (p_definition is null or v.definition = p_definition))::integer,
        (select name from app_user where id = e.user_id)
    from scoped_events(period_from, period_to, with_impersonated, p_definition, null) as e
    group by e.user_id
$$;

-- The shape of `missing_periods`, for Hasura
create table period_row (
    period_from timestamptz not null,
    period_to timestamptz not null
);

-- The parts of a period whose events were not all fetched
create function missing_periods(period_from timestamptz, period_to timestamptz)
returns setof period_row
language sql stable
as $$
    select lower(gap), upper(gap)
    from coverage, unnest(tstzmultirange(tstzrange(period_from, period_to)) - coverage.ranges) as gap
    where coverage.kind = 'events'
    order by 1
$$;

-- The events stored, by type: a type the app does not know shows here
create view event_type_count as
select
    count(*)::integer as events,
    min(occurred_at) as first_at,
    max(occurred_at) as last_at,
    event_type
from event
group by event_type;
