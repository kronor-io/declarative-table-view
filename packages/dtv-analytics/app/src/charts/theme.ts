/*
 * The charts' colors, from the reference palette of the dataviz method: one hue for a single
 * series, and the status red only for failures, always with a label.
 * The app is light only, as DTV's theme is.
 */

export const SERIES = '#2a78d6';

export const CRITICAL = '#d03b3b';

export const SURFACE = '#ffffff';
export const TEXT = '#1f2937';
export const TEXT_MUTED = '#6b7280';
export const GRID = '#eef0f3';
export const AXIS = '#d1d5db';

export const axisLabel = { color: TEXT_MUTED, fontSize: 11 };

export const tooltip = {
    backgroundColor: SURFACE,
    borderColor: AXIS,
    textStyle: { color: TEXT, fontSize: 12 },
};

export const formatMs = (ms: number | null | undefined): string => {
    if (ms === null || ms === undefined) return '–';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${(ms / 60_000).toFixed(1)} min`;
};
