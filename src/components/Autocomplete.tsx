import { GraphQLClient } from "graphql-request";
import { AutoComplete } from "primereact/autocomplete";
import { useCallback, useState } from "react";
import { SuggestionFetcher, SuggestionItem } from "../framework/filters";

type AutocompleteProps = {
    value: any;
    placeholder?: string;
    onChange: (value: any) => void;
    graphqlClient: GraphQLClient;
    suggestionFetcher: SuggestionFetcher;
    queryMinLength?: number;
};

// Autocomplete requires local suggestions state; implement inline component to manage it.
export const Autocomplete = ({ value, placeholder, onChange, graphqlClient, suggestionFetcher, queryMinLength = 1 }: AutocompleteProps) => {
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);

    const fetchSuggestions = useCallback(async (query: string) => {
        if (query.length < queryMinLength) {
            setSuggestions([]);
            return;
        }
        try {
            const items = await suggestionFetcher(query, graphqlClient);
            setSuggestions(items);
        } catch (err) {
            // Silently ignore errors to avoid breaking filter form
            console.warn('Autocomplete suggestionFetcher error:', err);
        }
    }, [graphqlClient, suggestionFetcher, queryMinLength]);

    return (
        <div className="tw:flex tw:flex-col tw:gap-1">
            <AutoComplete
                className='max-w-max' // To make sure the absolutely positioned loading indicator is correctly aligned
                value={value}
                onChange={e => onChange(e.value)}
                forceSelection={true}
                suggestions={suggestions}
                completeMethod={e => fetchSuggestions(e.query)}
                placeholder={placeholder}
                field='label'
            />
            <small>
                Type at least {queryMinLength} character{queryMinLength > 1 ? 's' : ''} to see suggestions.
            </small>
        </div>

    );
};
