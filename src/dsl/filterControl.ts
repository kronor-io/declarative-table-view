import * as React from 'react';
import type { FilterControl as FrameworkFilterControl, SuggestionFetcher } from '../framework/filters';

export type { SuggestionFetcher };
export type FilterControl = FrameworkFilterControl;

// Helper functions for building FilterControl values
export const FilterControl = {
    text: (options?: { label?: string; placeholder?: string }): FrameworkFilterControl =>
        ({ type: 'text', ...options }),
    number: (options?: { label?: string; placeholder?: string; initialValue?: any }): FrameworkFilterControl =>
        ({ type: 'number', ...options }),
    date: (options?: { label?: string; placeholder?: string; showTime?: boolean; initialValue?: any }): FrameworkFilterControl =>
        ({ type: 'date', ...options }),
    dropdown: (options: { label?: string; items: { label: string; value: any }[] }): FrameworkFilterControl =>
        ({ type: 'dropdown', ...options }),
    multiselect: (options: { label?: string; items: { label: string; value: any }[], filterable?: boolean }): FrameworkFilterControl =>
        ({ type: 'multiselect', ...options }),
    customOperator: (options: { label?: string; operators: { label: string; value: string }[]; valueControl: FrameworkFilterControl }): FrameworkFilterControl =>
        ({ type: 'customOperator', ...options }),
    autocomplete: (options: { label?: string; placeholder?: string; suggestionFetcher: SuggestionFetcher; queryMinLength?: number; suggestionLabelField?: string; multiple?: boolean; selectionLimit?: number }): FrameworkFilterControl =>
        ({ type: 'autocomplete', ...options }),
    custom: (component: React.ComponentType<any>, options?: { label?: string; props?: Record<string, any> }): FrameworkFilterControl =>
        ({ type: 'custom', component, ...options }),
};
