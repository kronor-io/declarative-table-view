import * as React from 'react';
import type { FilterControl as FrameworkFilterControl, SuggestionFetcher, SuggestionItem } from '../framework/filters';
import type * as FilterValue from '../framework/filterValue';
import type { MutableTuple } from './filterTyping';

export type { SuggestionFetcher, SuggestionItem };
export type FilterControl = FrameworkFilterControl;

/**
 * The controls below return their own variant of `FilterControl` rather than
 * the whole union, and keep inline `items`/`operators` lists as tuples. That
 * lets `filter({ rowType })` check the control against the type of the field
 * it filters — see ./filterTyping.
 */
type ControlOfType<Type extends FrameworkFilterControl['type']> = Extract<FrameworkFilterControl, { type: Type }>;

export type TextControl = ControlOfType<'text'>;
export type NumberControl = ControlOfType<'number'>;
export type DateControl = ControlOfType<'date'>;

export type AutocompleteControl<
    Item extends SuggestionItem = SuggestionItem,
    Multiple extends boolean = false
> = Omit<ControlOfType<'autocomplete'>, 'suggestionFetcher' | 'multiple'> & {
    suggestionFetcher: SuggestionFetcher<Item>;
    multiple?: Multiple;
};

export type CustomControl<Component extends React.ComponentType<any> = React.ComponentType<any>> =
    Omit<ControlOfType<'custom'>, 'component'> & { component: Component };

export type ItemControlItem = { label: string; value: unknown };

export type DropdownControl<Items extends readonly ItemControlItem[]> = Omit<ControlOfType<'dropdown'>, 'items'> & {
    items: MutableTuple<Items>;
};

export type MultiselectControl<Items extends readonly ItemControlItem[]> = Omit<ControlOfType<'multiselect'>, 'items'> & {
    items: MutableTuple<Items>;
};

export type CustomOperatorControl<
    Operators extends readonly { label: string; value: string }[],
    ValueControl extends FrameworkFilterControl
> = Omit<ControlOfType<'customOperator'>, 'operators' | 'valueControl'> & {
    operators: MutableTuple<Operators>;
    valueControl: ValueControl;
};

/**
 * Every control can be seeded with a starting value, typed as the value that
 * control produces (see `ControlValue` below) so a default cannot be of the
 * wrong shape for its own input.
 *
 * `customOperator` is the exception: its `initialValue` seeds the *inner*
 * value, alongside `valueControl.initialValue`, rather than the
 * `{ operator, value }` pair the control stores — see `buildInitialFormState`
 * in framework/state.
 */
export const FilterControl = {
    text: (options?: { label?: string; placeholder?: string; initialValue?: ControlValue<TextControl> }): TextControl =>
        ({ type: 'text', ...options }),
    number: (options?: { label?: string; placeholder?: string; initialValue?: ControlValue<NumberControl> }): NumberControl =>
        ({ type: 'number', ...options }),
    date: (options?: { label?: string; placeholder?: string; showTime?: boolean; initialValue?: ControlValue<DateControl> }): DateControl =>
        ({ type: 'date', ...options }),
    dropdown: <const Items extends readonly ItemControlItem[]>(options: { label?: string; items: Items; filterable?: boolean; initialValue?: ControlValue<DropdownControl<Items>> }): DropdownControl<Items> =>
        ({ type: 'dropdown', ...options, items: [...options.items] }),
    multiselect: <const Items extends readonly ItemControlItem[]>(options: { label?: string; items: Items, filterable?: boolean; initialValue?: ControlValue<MultiselectControl<Items>> }): MultiselectControl<Items> =>
        ({ type: 'multiselect', ...options, items: [...options.items] }),
    customOperator: <
        const Operators extends readonly { label: string; value: string }[],
        const ValueControl extends FrameworkFilterControl
    >(options: { label?: string; operators: Operators; valueControl: ValueControl; initialValue?: ControlValue<ValueControl> }): CustomOperatorControl<Operators, ValueControl> =>
        ({ type: 'customOperator', ...options, operators: [...options.operators] }),
    autocomplete: <Item extends SuggestionItem, const Multiple extends boolean = false>(options: { label?: string; placeholder?: string; suggestionFetcher: SuggestionFetcher<Item>; queryMinLength?: number; suggestionLabelField?: string; multiple?: Multiple; selectionLimit?: number; initialValue?: ControlValue<AutocompleteControl<Item, Multiple>> }): AutocompleteControl<Item, Multiple> =>
        ({ type: 'autocomplete', ...options }),
    custom: <const Component extends React.ComponentType<any>>(component: Component, options?: { label?: string; props?: Record<string, any>; initialValue?: ControlValue<CustomControl<Component>> }): CustomControl<Component> =>
        ({ type: 'custom', component, ...options }),
};

/**
 * The value a control hands to its filter's query transform — what the form
 * stores for it, which is also what `FilterTransform`'s `input` receives.
 * Mirrors `renderInput` in components/FilterForm.tsx.
 *
 * `unknown` where the control cannot say: a `custom` component that does not
 * type its `onChange`, or item/operator lists assembled at runtime.
 */
export type ControlValue<Control> =
    Control extends { type: 'text' } ? string
    : Control extends { type: 'number' } ? number | null
    : Control extends { type: 'date' } ? Date
    : Control extends { type: 'dropdown'; items: infer Items } ? ItemValue<Items>
    : Control extends { type: 'multiselect'; items: infer Items } ? ItemValue<Items>[]
    : Control extends { type: 'customOperator'; operators: infer Operators }
    // The inner value stays wrapped: a customOperator leaf stores both the
    // chosen operator and the value control's own FilterValue.
    ? { operator: OperatorValue<Operators>; value: FilterValue.FilterValue }
    : Control extends { type: 'autocomplete'; suggestionFetcher: SuggestionFetcher<infer Item>; multiple?: infer Multiple }
    ? SelectedSuggestion<Item, Multiple>
    : Control extends { type: 'custom'; component: infer Component } ? CustomComponentValue<Component>
    : unknown;

type ItemValue<Items> = Items extends readonly { value: infer Value }[] ? Value : unknown;

type OperatorValue<Operators> = Operators extends readonly { value: infer Operator }[] ? Operator : string;

type SelectedSuggestion<Item, Multiple> = Exclude<Multiple, undefined> extends infer Many
    ? [Many] extends [never] ? Item
    : boolean extends Many ? Item | Item[]
    : Many extends true ? Item[]
    : Item
    : never;

type CustomComponentValue<Component> = Component extends React.ComponentType<infer Props>
    ? Props extends { onChange?: ((value: infer Value) => void) | undefined } ? Value : unknown
    : unknown;
