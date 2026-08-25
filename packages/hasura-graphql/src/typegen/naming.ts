// Identifier and literal helpers shared by schema-to-TypeScript generators.

export function toPascalCase(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

export function toIdentifier(pascal: string): string {
    if (/^[A-Za-z_]/.test(pascal)) return pascal;
    return `_${pascal}`;
}

export function singleQuoteStringLiteral(value: string): string {
    // Emit a TS string literal using single quotes.
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}
