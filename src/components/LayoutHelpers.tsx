import React from "react";

function wrapStringChildren(children: React.ReactNode) {
    if (typeof children === "string") {
        return <span>{children}</span>;
    }
    if (Array.isArray(children)) {
        return children.map((child, i) =>
            typeof child === "string" ? <span key={i}>{child}</span> : child
        );
    }
    return children;
}

function getAlignClass(align?: string) {
    switch (align) {
        case 'start': return 'items-start';
        case 'center': return 'items-center';
        case 'end': return 'items-end';
        case 'stretch': return 'items-stretch';
        case 'baseline': return 'items-baseline';
        default: return '';
    }
}

function getJustifyClass(justify?: string) {
    switch (justify) {
        case 'start': return 'justify-start';
        case 'center': return 'justify-center';
        case 'end': return 'justify-end';
        case 'between': return 'justify-between';
        case 'around': return 'justify-around';
        case 'evenly': return 'justify-evenly';
        default: return '';
    }
}

// Horizontal stack (row) with gap
export function HStack({ gap = "gap-2", className = "", align, justify, children }: { gap?: string; className?: string; align?: string; justify?: string; children: React.ReactNode }) {
    return (
        <div className={`flex flex-row ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Vertical stack (column) with gap
export function VStack({ gap = "gap-2", className = "", align, justify, children }: { gap?: string; className?: string; align?: string; justify?: string; children: React.ReactNode }) {
    return (
        <div className={`flex flex-col ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Center content both vertically and horizontally
export function Center({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return <div className={`flex items-center justify-center ${className}`}>{wrapStringChildren(children)}</div>;
}

// Spacer for use in flex layouts
export function Spacer() {
    return <div className="flex-1" />;
}

// FormattedDate: formats a date string using toLocaleString
export function DateTime({ date, locale = undefined, options = undefined, className = "" }: { date: string; locale?: string; options?: Intl.DateTimeFormatOptions; className?: string }) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>{date}</span>;
    return <span className={className}>{d.toLocaleString(locale, options)}</span>;
}

// Left: aligns children to the start (left) of a flex container
export function Left({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return <div className={`flex justify-start items-center ${className}`}>{wrapStringChildren(children)}</div>;
}

// Right: aligns children to the end (right) of a flex container
export function Right({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return <div className={`flex justify-end items-center ${className}`}>{wrapStringChildren(children)}</div>;
}

// CurrencyAmount: formats a number as currency using Intl.NumberFormat
export function CurrencyAmount({ amount, currency, locale = undefined, options = {}, className = "" }: { amount: number | string; currency: string; locale?: string; options?: Intl.NumberFormatOptions; className?: string }) {
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount)) return null;
    const formatOptions: Intl.NumberFormatOptions = { style: 'currency', currency, ...options };
    const formatter = new Intl.NumberFormat(locale, formatOptions);
    return <span className={className}>{formatter.format(parsedAmount)}</span>;
}
