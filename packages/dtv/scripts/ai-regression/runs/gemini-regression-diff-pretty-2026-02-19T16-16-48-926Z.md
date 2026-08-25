# Gemini regression diff

- Previous: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-15-08-376Z.json
- Current: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-16-48-926Z.json

---

## Prompt

```
authorized payments in euro or danish krona this week
```

Unchanged: 0, Changed: 3

```diff
- currency (previous)
+ currency (current)

  Object {
-   "children": Array [
-     Object {
    "type": "leaf",
-       "value": "EUR",
-     },
-     Object {
-       "type": "leaf",
-       "value": "DKK",
-     },
+   "value": Array [
+     "EUR",
+     "DKK",
    ],
-   "type": "or",
  }
```

```diff
- date-range (previous)
+ date-range (current)

  Object {
    "children": Array [
      Object {
        "type": "leaf",
-       "value": "2026-02-16T00:00:00.000Z",
+       "value": "2026-02-12T00:00:00.000Z",
      },
      Object {
        "type": "leaf",
-       "value": "2026-02-19T17:15:01.000Z",
+       "value": "2026-02-19T23:59:59.999Z",
      },
    ],
    "type": "and",
  }
```

```diff
- payment-status (previous)
+ payment-status (current)

  Object {
    "type": "leaf",
-   "value": "AUTHORIZED",
+   "value": Array [
+     "AUTHORIZED",
+   ],
  }
```

---

## Prompt

```
credit card payments above 1000 DKK in the last 30 days
```

Unchanged: 0, Changed: 4

```diff
- amount-range (previous)
+ amount-range (current)

  Object {
-   "children": Array [
-     Object {
    "type": "leaf",
-       "value": 1000,
-     },
-     Object {
-       "type": "leaf",
-       "value": null,
+   "value": Object {
+     "greaterThanOrEqual": 1000,
    },
-   ],
-   "type": "and",
  }
```

```diff
- currency (previous)
+ currency (current)

  Object {
    "type": "leaf",
-   "value": "DKK",
+   "value": Array [
+     "DKK",
+   ],
  }
```

```diff
- date-range (previous)
+ date-range (current)

  Object {
-   "children": Array [
-     Object {
    "type": "leaf",
-       "value": "2026-01-20T00:00:00.000Z",
-     },
-     Object {
-       "type": "leaf",
-       "value": "2026-02-19T00:00:00.000Z",
+   "value": Object {
+     "greaterThanOrEqual": "2026-01-20T00:00:00.000Z",
+     "lessThanOrEqual": "2026-02-19T23:59:59.999Z",
    },
-   ],
-   "type": "and",
  }
```

```diff
- payment-provider (previous)
+ payment-provider (current)

  Object {
    "type": "leaf",
-   "value": "CREDIT_CARD",
+   "value": Array [
+     "CREDIT_CARD",
+   ],
  }
```

---

## Prompt

```
mobilepay payments from the last 7 days
```

Unchanged: 0, Changed: 2

```diff
- date-range (previous)
+ date-range (current)

  Object {
    "children": Array [
      Object {
        "type": "leaf",
-       "value": "2026-02-12T17:15:04.000Z",
+       "value": "2026-02-12T17:16:45.000Z",
      },
      Object {
        "type": "leaf",
-       "value": "2026-02-19T17:15:04.000Z",
+       "value": "2026-02-19T17:16:45.000Z",
      },
    ],
    "type": "and",
  }
```

```diff
- payment-provider (previous)
+ payment-provider (current)

  Object {
    "type": "leaf",
-   "value": "MOBILEPAY",
+   "value": Array [
+     "MOBILEPAY",
+   ],
  }
```

---

## Prompt

```
payment requests for merchant Boozt Dev
```

Unchanged: 0, Changed: 1

```diff
- merchant (previous)
+ merchant (current)

  Object {
    "type": "leaf",
-   "value": 2,
+   "value": Array [
+     2,
+   ],
  }
```

---

## Prompt

```
paypal payments in EUR during January 2026
```

Unchanged: 1, Changed: 2

```diff
- currency (previous)
+ currency (current)

  Object {
    "type": "leaf",
-   "value": "EUR",
+   "value": Array [
+     "EUR",
+   ],
  }
```

```diff
- payment-provider (previous)
+ payment-provider (current)

  Object {
    "type": "leaf",
-   "value": "PAYPAL",
+   "value": Array [
+     "PAYPAL",
+   ],
  }
```

---

## Prompt

```
pending payments placed today
```

Unchanged: 1, Changed: 1

```diff
- payment-status (previous)
+ payment-status (current)

  Object {
    "type": "leaf",
    "value": Array [
+     "PRE_FLIGHT_CHECK",
      "INITIALIZING",
      "WAITING_FOR_PAYMENT",
-     "PRE_FLIGHT_CHECK",
+     "WAITING_FOR_PROMOTION",
    ],
  }
```
