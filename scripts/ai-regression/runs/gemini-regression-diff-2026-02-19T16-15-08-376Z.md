# Gemini regression diff

- Previous: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-14-49-540Z.json
- Current: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-15-08-376Z.json

## Prompt

```
authorized payments in euro or danish krona this week
```

- Unchanged filter IDs: currency, payment-status
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: date-range

### date-range

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: children

- \~ `date-range.children[1].value`: "2026-02-23T00:00:00.000Z" → "2026-02-19T17:15:01.000Z"

## Prompt

```
credit card payments above 1000 DKK in the last 30 days
```

- Unchanged filter IDs: amount-range, currency, payment-provider
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: date-range

### date-range

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: children

- \~ `date-range.children[0].value`: "2026-01-20T17:14:45.000Z" → "2026-01-20T00:00:00.000Z"
- \~ `date-range.children[1].value`: "2026-02-19T17:14:45.000Z" → "2026-02-19T00:00:00.000Z"

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

- Unchanged filter IDs: payment-provider
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: date-range

### date-range

- Top-level unchanged: type
- Top-level added: (none)
- Top-level removed: (none)
- Top-level changed: children

- \~ `date-range.children[0].value`: "2026-02-12T17:14:46GMT+0100" → "2026-02-12T17:15:04.000Z"
- \~ `date-range.children[1].value`: "2026-02-19T17:14:46GMT+0100" → "2026-02-19T17:15:04.000Z"

## Prompt

```
payment requests for merchant Boozt Dev
```

- Unchanged filter IDs: merchant
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: (none)

## Prompt

```
paypal payments in EUR during January 2026
```

- Unchanged filter IDs: currency, date-range, payment-provider
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: (none)

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

- \~ `payment-status.value`: "WAITING_FOR_PAYMENT" → ["INITIALIZING","WAITING_FOR_PAYMENT","PRE_FLIGHT_CHECK"]

## Prompt

```
requests initiated by customer email containing "@boozt.com"
```

- Unchanged filter IDs: customer-email
- Added filter IDs: (none)
- Removed filter IDs: (none)
- Changed filter IDs: (none)

