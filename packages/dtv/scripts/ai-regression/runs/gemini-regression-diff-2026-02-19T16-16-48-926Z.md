# Gemini regression diff

- Previous: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-15-08-376Z.json
- Current: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-16-48-926Z.json

## Prompt

```
authorized payments in euro or danish krona this week
```

- Unchanged filter IDs: (none)
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: currency, date-range, payment-status

### currency

- Top-level unchanged: (none)
- Top-level added: value
- Top-level removed: children
- Top-level changed: type

- \- `currency.children`: [{"type":"leaf","value":"EUR"},{"type":"leaf","value":"DKK"}]
- \~ `currency.type`: "or" → "leaf"
- \+ `currency.value`: ["EUR","DKK"]

### date-range

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: children

- \~ `date-range.children[0].value`: "2026-02-16T00:00:00.000Z" → "2026-02-12T00:00:00.000Z"
- \~ `date-range.children[1].value`: "2026-02-19T17:15:01.000Z" → "2026-02-19T23:59:59.999Z"

### payment-status

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `payment-status.value`: "AUTHORIZED" → ["AUTHORIZED"]

## Prompt

```
credit card payments above 1000 DKK in the last 30 days
```

- Unchanged filter IDs: (none)
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: amount-range, currency, date-range, payment-provider

### amount-range

- Top-level unchanged: (none)
- Top-level added: value
- Top-level removed: children
- Top-level changed: type

- \- `amount-range.children`: [{"type":"leaf","value":1000},{"type":"leaf","value":null}]
- \~ `amount-range.type`: "and" → "leaf"
- \+ `amount-range.value`: {"greaterThanOrEqual":1000}

### currency

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `currency.value`: "DKK" → ["DKK"]

### date-range

- Top-level unchanged: (none)
- Top-level added: value
- Top-level removed: children
- Top-level changed: type

- \- `date-range.children`: [{"type":"leaf","value":"2026-01-20T00:00:00.000Z"},{"type":"leaf","value":"2026-02-19T00:00:00.000Z"}]
- \~ `date-range.type`: "and" → "leaf"
- \+ `date-range.value`: {"greaterThanOrEqual":"2026-01-20T00:00:00.000Z","lessThanOrEqual":"2026-02-19T23:59:59.999Z"}

### payment-provider

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `payment-provider.value`: "CREDIT_CARD" → ["CREDIT_CARD"]

## Prompt

```
failed payments from yesterday
```

- Unchanged filter IDs: date-range, payment-status
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: (none)

## Prompt

```
mobilepay payments from the last 7 days
```

- Unchanged filter IDs: (none)
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: date-range, payment-provider

### date-range

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: children

- \~ `date-range.children[0].value`: "2026-02-12T17:15:04.000Z" → "2026-02-12T17:16:45.000Z"
- \~ `date-range.children[1].value`: "2026-02-19T17:15:04.000Z" → "2026-02-19T17:16:45.000Z"

### payment-provider

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `payment-provider.value`: "MOBILEPAY" → ["MOBILEPAY"]

## Prompt

```
payment requests for merchant Boozt Dev
```

- Unchanged filter IDs: (none)
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: merchant

### merchant

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `merchant.value`: 2 → [2]

## Prompt

```
paypal payments in EUR during January 2026
```

- Unchanged filter IDs: date-range
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: currency, payment-provider

### currency

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `currency.value`: "EUR" → ["EUR"]

### payment-provider

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `payment-provider.value`: "PAYPAL" → ["PAYPAL"]

## Prompt

```
pending payments placed today
```

- Unchanged filter IDs: date-range
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: payment-status

### payment-status

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: value

- \~ `payment-status.value[0]`: "INITIALIZING" → "PRE_FLIGHT_CHECK"
- \~ `payment-status.value[1]`: "WAITING_FOR_PAYMENT" → "INITIALIZING"
- \~ `payment-status.value[2]`: "PRE_FLIGHT_CHECK" → "WAITING_FOR_PAYMENT"
- \+ `payment-status.value[3]`: "WAITING_FOR_PROMOTION"

## Prompt

```
requests initiated by customer email containing "@boozt.com"
```

- Unchanged filter IDs: customer-email
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: (none)

