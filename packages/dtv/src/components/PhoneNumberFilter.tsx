import * as React from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { COUNTRY_CODES, DEFAULT_CODE, phoneFilterValue, splitCountryCode } from './phoneNumber';

export interface PhoneNumberFilterProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function PhoneNumberFilter({ value, onChange }: PhoneNumberFilterProps) {
    const incoming = value ?? '';
    const [selectedCode, setSelectedCode] = React.useState(() => splitCountryCode(incoming).code ?? DEFAULT_CODE);
    const [number, setNumber] = React.useState(() => splitCountryCode(incoming).number);
    const [prevValue, setPrevValue] = React.useState(incoming);

    if (incoming !== prevValue) {
        setPrevValue(incoming);
        if (incoming !== phoneFilterValue(selectedCode, number)) {
            const split = splitCountryCode(incoming);
            setSelectedCode(split.code ?? selectedCode);
            setNumber(split.number);
        }
    }

    const numberStartsWithPlus = number.trim().startsWith('+');

    const handleCodeChange = (e: { value: string }) => {
        setSelectedCode(e.value);
        onChange?.(phoneFilterValue(e.value, number));
    };
    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const typed = splitCountryCode(e.target.value);
        const code = typed.code ?? selectedCode;
        setSelectedCode(code);
        setNumber(typed.number);
        onChange?.(phoneFilterValue(code, typed.number));
    };

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Dropdown
                value={numberStartsWithPlus ? null : selectedCode}
                options={COUNTRY_CODES}
                onChange={handleCodeChange}
                disabled={numberStartsWithPlus}
                placeholder="Code"
                filter
            />
            <InputText
                type="text"
                placeholder="Phone number"
                value={number}
                onChange={handleNumberChange}
            />
        </div>
    );
}
