export type OrderDirection = 'ASC' | 'DESC';

export function isOrderDirection(value: unknown): value is OrderDirection {
    return value === 'ASC' || value === 'DESC';
}
