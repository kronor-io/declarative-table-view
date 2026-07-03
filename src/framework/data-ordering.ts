import type { OrderDirection } from './order-direction';

export type DataOrdering = {
    field: string;
    direction: OrderDirection;
};

export function dataOrderingsEqual(left: DataOrdering | null, right: DataOrdering | null): boolean {
    if (left === null || right === null) {
        return left === right;
    }

    return left.field === right.field && left.direction === right.direction;
}
