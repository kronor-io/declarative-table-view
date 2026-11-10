-- The saved filters tab and the errors tab.

-- The shape of `saved_filter_stats`, for Hasura
create table saved_filter_stats_row (
    created_at timestamptz,
    -- When it was last applied in the period
    last_applied_at timestamptz,
    user_id bigint not null,
    -- How often it was applied in the period
    applications integer not null,
    filter_count integer not null,
    -- user, view and saved filter: what tells it apart
    key text not null,
    user_name text,
    view_id text not null,
    definition text,
    id text not null,
    name text not null,
    filters text not null
);

-- The saved filters users keep, in their latest user data, with how often each was applied in
-- the period; only those of `p_user_id` when given
create function saved_filter_stats(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_user_id bigint default null
)
returns setof saved_filter_stats_row
language sql stable
as $$
    with applied as (
        select user_id, payload -> 'savedFilter' ->> 'id' as id, count(*) as applications, max(occurred_at) as last_at
        from scoped_events(period_from, period_to, with_impersonated, null, p_user_id)
        where event_type = 'filtersApplied' and payload ->> 'trigger' = 'savedFilter'
        group by 1, 2
    )

    select
        s.created_at,
        a.last_at,
        s.user_id,
        coalesce(a.applications, 0)::integer,
        cardinality(s.filters),
        s.user_id || ':' || s.view_id || ':' || s.id,
        u.name,
        s.view_id,
        v.definition,
        s.id,
        s.name,
        array_to_string(s.filters, ', ')
    from saved_filter as s
    join current_user_view_data as v on v.user_id = s.user_id and v.revision = s.revision and v.view_id = s.view_id
    left join app_user as u on u.id = s.user_id
    left join applied as a on a.user_id = s.user_id and a.id = s.id
    where p_user_id is null or s.user_id = p_user_id
$$;

-- The shape of `saved_filter_summary`, for Hasura
create table saved_filter_summary_row (
    saved_filters integer not null,
    users integer not null,
    definitions integer not null,
    -- Applications of saved filters in the period, and saved filters applied at least once
    applications integer not null,
    applied integer not null,
    created integer not null,
    overwritten integer not null,
    deleted integer not null
);

-- The saved filters at a glance: what users keep, and what they did with them in the period
create function saved_filter_summary(period_from timestamptz, period_to timestamptz, with_impersonated boolean default false)
returns setof saved_filter_summary_row
language sql stable
as $$
    with events as (
        select * from scoped_events(period_from, period_to, with_impersonated, null, null)
        where event_type in ('filtersApplied', 'savedFilterSaved', 'savedFilterDeleted')
    ),

    kept as (
        select * from saved_filter_stats(period_from, period_to, with_impersonated)
    )

    select
        (select count(*) from kept)::integer,
        (select count(distinct user_id) from kept)::integer,
        (select count(distinct definition) from kept)::integer,
        (select count(*) from events where event_type = 'filtersApplied' and payload ->> 'trigger' = 'savedFilter')::integer,
        (select count(*) from kept where applications > 0)::integer,
        (select count(*) from events where event_type = 'savedFilterSaved' and (payload ->> 'created')::boolean)::integer,
        (select count(*) from events where event_type = 'savedFilterSaved' and not (payload ->> 'created')::boolean)::integer,
        (select count(*) from events where event_type = 'savedFilterDeleted')::integer
$$;

-- The saved filters users keep, counted by `kind`:
--   definition   saved filters per definition
--   filter       the filters saved filters set
--   filterCount  how many filters a saved filter sets
--   applied      applications of saved filters in the period, per definition
create function saved_filter_breakdown(period_from timestamptz, period_to timestamptz, with_impersonated boolean default false)
returns setof breakdown_row
language sql stable
as $$
    with kept as (
        select * from saved_filter_stats(period_from, period_to, with_impersonated)
    ),

    keyed as (
        select 'definition' as kind, coalesce(definition, view_id) as key, user_id, 1 as n from kept
        union all
        select 'filter', unnest(string_to_array(nullif(filters, ''), ', ')), user_id, 1 from kept
        union all
        select 'filterCount', filter_count || case when filter_count = 1 then ' filter' else ' filters' end, user_id, 1 from kept
        union all
        select 'applied', coalesce(definition, view_id), user_id, applications from kept where applications > 0
    )

    select sum(n)::integer, count(distinct user_id)::integer, kind, key
    from keyed
    group by kind, key
    -- Filters per saved filter in their own order, the rest most first
    order by kind, case when kind = 'filterCount' then split_part(key, ' ', 1)::integer end, sum(n) desc
$$;

-- The errors of the scope, one row per event: what failed (`type`), how (`kind`) and what it said.
--   fetch                        a request for rows: its FetchErrorInfo kind and message
--   action                       an action that threw: the action, and its error's name
--   rowExpansionLoad, aiFilter   a row expansion or the AI assistant: its error
--   userDataLoad                 loading user data failed: the table went on with the local copy
--   userDataSaveFailed           saving user data failed
--   userDataConflict             another writer saved first, and writing again failed
--   userDataReadOnly             user data could not be read, so the table does not save it
--   filtersChangedSinceSnapshot  filters defined differently than stored data says: their state was reset
--   suggestionsFailed            a filter's suggestions could not be fetched
create view error_event as
select
    id as event_id,
    user_id,
    impersonator_id,
    occurred_at,
    event_type as type,
    definition,
    view_id,
    case event_type
        when 'fetch' then coalesce(payload -> 'error' ->> 'kind', 'unknown')
        when 'action' then (payload ->> 'action') || ': ' || coalesce(payload -> 'error' ->> 'name', 'Error')
        when 'userDataLoad' then coalesce(payload -> 'error' ->> 'kind', 'unknown')
        when 'userDataSaveFailed' then coalesce(payload -> 'error' ->> 'kind', 'unknown')
        when 'userDataConflict' then 'not resolved'
        when 'userDataReadOnly' then 'read only'
        when 'filtersChangedSinceSnapshot' then 'definition changed'
        else coalesce(payload -> 'error' ->> 'name', 'Error')
    end as kind,
    left(case event_type
        when 'userDataReadOnly' then payload ->> 'message'
        when 'filtersChangedSinceSnapshot' then concat_ws('; ',
            'changed ' || nullif(array_to_string(array(select jsonb_array_elements_text(payload -> 'changed')), ', '), ''),
            'added ' || nullif(array_to_string(array(select jsonb_array_elements_text(payload -> 'added')), ', '), ''),
            'removed ' || nullif(array_to_string(array(select jsonb_array_elements_text(payload -> 'removed')), ', '), ''))
        else coalesce(payload -> 'error' ->> 'message', '')
    end, 500) as message
from event
where (event_type in ('fetch', 'action', 'rowExpansionLoad', 'aiFilter', 'userDataLoad') and payload ->> 'outcome' = 'failed')
    or (event_type = 'userDataConflict' and not (payload ->> 'resolved')::boolean)
    or event_type in ('userDataSaveFailed', 'userDataReadOnly', 'filtersChangedSinceSnapshot', 'suggestionsFailed');

-- The shape of `error_groups`, for Hasura
create table error_group_row (
    first_at timestamptz not null,
    last_at timestamptz not null,
    errors integer not null,
    users integer not null,
    -- type, definition, kind and message: what tells it apart
    key text not null,
    type text not null,
    definition text not null,
    kind text not null,
    message text not null
);

-- The scope's errors, the same ones together
create function error_groups(
    period_from timestamptz,
    period_to timestamptz,
    with_impersonated boolean default false,
    p_definition text default null,
    p_user_id bigint default null
)
returns setof error_group_row
language sql stable
as $$
    select
        min(occurred_at),
        max(occurred_at),
        count(*)::integer,
        count(distinct user_id)::integer,
        md5(concat_ws(chr(31), type, definition, kind, message)),
        type,
        definition,
        kind,
        message
    from error_event
    where occurred_at >= period_from and occurred_at < period_to
        and (with_impersonated or impersonator_id is null)
        and (p_definition is null or definition = p_definition)
        and (p_user_id is null or user_id = p_user_id)
    group by type, definition, kind, message
$$;

-- The shape of `errors_daily`, for Hasura
create table daily_count_row (
    day date not null,
    count integer not null,
    users integer not null
);

-- The scope's errors per day in `time_zone`, every day of it
create function errors_daily(period_from timestamptz, period_to timestamptz, time_zone text, with_impersonated boolean default false)
returns setof daily_count_row
language sql stable
as $$
    with days as (
        select generate_series(
            (period_from at time zone time_zone)::date,
            ((period_to - interval '1 microsecond') at time zone time_zone)::date,
            interval '1 day'
        )::date as day
    ),

    errors as (
        select (occurred_at at time zone time_zone)::date as day, user_id
        from error_event
        where occurred_at >= period_from and occurred_at < period_to
            and (with_impersonated or impersonator_id is null)
    )

    select d.day, count(e.user_id)::integer, count(distinct e.user_id)::integer
    from days as d
    left join errors as e on e.day = d.day
    group by d.day
    order by d.day
$$;
