import React from "react";

/**
 * Generic mapping component for displaying mapped values.
 * @param value The key to map.
 * @param map The mapping object.
 * @param fallback Optional fallback if value is not found.
 */
export function Mapping<T extends string | number, U>({ value, map, fallback }: { value: T; map: Record<T, U>; fallback?: React.ReactNode }) {
    return <>{map[value] ?? fallback ?? value}</>;
}
