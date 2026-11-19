-- Failed requests for a view's aggregates (`aggregatesFetch`) are errors too: their
-- FetchErrorInfo kind and message, as for `fetch`.
create or replace view error_event as
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
        when 'aggregatesFetch' then coalesce(payload -> 'error' ->> 'kind', 'unknown')
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
where (event_type in ('fetch', 'aggregatesFetch', 'action', 'rowExpansionLoad', 'aiFilter', 'userDataLoad') and payload ->> 'outcome' = 'failed')
    or (event_type = 'userDataConflict' and not (payload ->> 'resolved')::boolean)
    or event_type in ('userDataSaveFailed', 'userDataReadOnly', 'filtersChangedSinceSnapshot', 'suggestionsFailed');
