import * as React from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';

const COUNTRY_CODES = [
    { label: 'Sweden (+46)', value: '+46' },
    { label: 'Austria (+43)', value: '+43' },
    { label: 'Belgium (+32)', value: '+32' },
    { label: 'Croatia (+385)', value: '+385' },
    { label: 'Cyprus (+357)', value: '+357' },
    { label: 'Czech Republic (+420)', value: '+420' },
    { label: 'Denmark (+45)', value: '+45' },
    { label: 'Estonia (+372)', value: '+372' },
    { label: 'Finland (+358)', value: '+358' },
    { label: 'France (+33)', value: '+33' },
    { label: 'Germany (+49)', value: '+49' },
    { label: 'Greece (+30)', value: '+30' },
    { label: 'Hungary (+36)', value: '+36' },
    { label: 'Iceland (+354)', value: '+354' },
    { label: 'Ireland (+353)', value: '+353' },
    { label: 'Italy (+39)', value: '+39' },
    { label: 'Latvia (+371)', value: '+371' },
    { label: 'Liechtenstein (+423)', value: '+423' },
    { label: 'Lithuania (+370)', value: '+370' },
    { label: 'Luxembourg (+352)', value: '+352' },
    { label: 'Malta (+356)', value: '+356' },
    { label: 'Netherlands (+31)', value: '+31' },
    { label: 'Norway (+47)', value: '+47' },
    { label: 'Poland (+48)', value: '+48' },
    { label: 'Portugal (+351)', value: '+351' },
    { label: 'Romania (+40)', value: '+40' },
    { label: 'Slovakia (+421)', value: '+421' },
    { label: 'Slovenia (+386)', value: '+386' },
    { label: 'Spain (+34)', value: '+34' },
];

export interface PhoneNumberFilterProps {
    value?: string;
    onChange?: (value: string) => void;
}

function parsePhoneNumber(value: string | undefined): { code: string | null; number: string } {
    if (!value) return { code: COUNTRY_CODES[0].value, number: '' };
    if (value.startsWith('+')) {
        // Try to match the longest code from COUNTRY_CODES
        const match = COUNTRY_CODES
            .map(c => c.value)
            .sort((a, b) => b.length - a.length) // longest first
            .find(code => value.startsWith(code));
        if (match) {
            return { code: match, number: value.slice(match.length) };
        }
        // fallback: treat as unknown code
        return { code: null, number: value };
    }
    return { code: COUNTRY_CODES[0].value, number: value };
}

export const PhoneNumberFilter: React.FC<PhoneNumberFilterProps> = ({ value, onChange }) => {
    const parsed = React.useMemo(() => {
        return parsePhoneNumber(value);
    }, [value]);

    const numberStartsWithPlus = parsed.number.trim().startsWith('+');

    const emitChange = (code: string | null, number: string) => {
        if (onChange) {
            if (code === null || numberStartsWithPlus) {
                onChange(number);
            } else {
                onChange(`${code}${number}`);
            }
        }
    };

    const handleCodeChange = (e: { value: string }) => {
        emitChange(e.value, parsed.number);
    };
    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsedNewValue = parsePhoneNumber(e.target.value);
        emitChange(parsedNewValue.code ?? parsed.code, parsedNewValue.number);
    };

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Dropdown
                value={numberStartsWithPlus ? null : parsed.code}
                options={COUNTRY_CODES}
                onChange={handleCodeChange}
                disabled={numberStartsWithPlus}
                placeholder="Code"
                filter
            />
            <InputText
                type="text"
                placeholder="Phone number"
                value={parsed.number}
                onChange={handleNumberChange}
            />
        </div>
    );
};
