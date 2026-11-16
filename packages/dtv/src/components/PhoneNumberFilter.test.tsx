import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { PhoneNumberFilter } from './PhoneNumberFilter';

type DropdownProps = { value: string | null; disabled: boolean; onChange: (e: { value: string }) => void };
type InputProps = { value: string; onChange: (e: { target: { value: string } }) => void };

const mockProps: { dropdown?: DropdownProps; input?: InputProps } = {};

jest.mock('primereact/dropdown', () => ({
    Dropdown: (props: DropdownProps) => {
        mockProps.dropdown = props;
        return null;
    }
}));
jest.mock('primereact/inputtext', () => ({
    InputText: (props: InputProps) => {
        mockProps.input = props;
        return null;
    }
}));

// Mirrors FilterForm: '' is stored as an empty value and handed back as null.
let setStoredValue: (value: string | null) => void = () => {};
let emitted: string[] = [];

function Harness({ initial }: { initial: string | null }) {
    const [value, setValue] = React.useState<string | null>(initial);
    setStoredValue = setValue;
    return (
        <PhoneNumberFilter
            value={value as string}
            onChange={v => {
                emitted.push(v);
                setValue(v === '' ? null : v);
            }}
        />
    );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    emitted = [];
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
});

const mount = (initial: string | null) => act(() => root.render(<Harness initial={initial} />));
const typeNumber = (text: string) => act(() => mockProps.input!.onChange({ target: { value: text } }));
const pickCode = (code: string) => act(() => mockProps.dropdown!.onChange({ value: code }));
const shown = () => ({
    code: mockProps.dropdown!.value,
    number: mockProps.input!.value,
    codeDisabled: mockProps.dropdown!.disabled
});

describe('PhoneNumberFilter', () => {
    it('keeps a country picked before typing', () => {
        mount(null);
        pickCode('+47');
        expect(emitted).toEqual(['']);
        expect(shown().code).toBe('+47');

        typeNumber('41234567');
        expect(emitted.at(-1)).toBe('+4741234567');
        expect(shown()).toEqual({ code: '+47', number: '41234567', codeDisabled: false });
    });

    it('sends no filter and keeps the country when the number is cleared', () => {
        mount('+4741234567');
        typeNumber('');
        expect(emitted).toEqual(['']);
        expect(shown()).toEqual({ code: '+47', number: '', codeDisabled: false });
    });

    it('goes back to the default country on a reset from outside', () => {
        mount('+4741234567');
        act(() => setStoredValue(null));
        expect(shown()).toEqual({ code: '+46', number: '', codeDisabled: false });
        expect(emitted).toEqual([]);
    });

    it('shows a loaded saved filter', () => {
        mount(null);
        act(() => setStoredValue('+358401234567'));
        expect(shown()).toEqual({ code: '+358', number: '401234567', codeDisabled: false });
    });

    it('keeps a typed leading + and sends nothing until the number is long enough', () => {
        mount(null);
        typeNumber('+');
        expect(emitted).toEqual(['']);
        expect(shown()).toEqual({ code: null, number: '+', codeDisabled: true });

        typeNumber('+44');
        expect(emitted.at(-1)).toBe('');
        expect(shown().number).toBe('+44');

        typeNumber('+447700900123');
        expect(emitted.at(-1)).toBe('+447700900123');
    });

    it('moves a typed known code to the dropdown, ignoring leading spaces', () => {
        mount(null);
        typeNumber(' +46');
        expect(emitted).toEqual(['']);
        expect(shown()).toEqual({ code: '+46', number: '', codeDisabled: false });
    });

    it('shows a bare code saved by an older version without sending anything', () => {
        mount('+46');
        expect(shown()).toEqual({ code: '+46', number: '', codeDisabled: false });
        expect(emitted).toEqual([]);
    });
});
