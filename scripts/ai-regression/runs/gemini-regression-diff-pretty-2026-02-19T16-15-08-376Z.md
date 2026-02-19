# Gemini regression diff (terminal style)

- Previous: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-14-49-540Z.json
- Current: /Users/daquirm/projects/boozt/dtv/scripts/ai-regression/runs/gemini-regression-2026-02-19T16-15-08-376Z.json

---

## Prompt

```
authorized payments in euro or danish krona this week
```

Unchanged: 2, Changed: 1

```diff
- date-range (previous)
+ date-range (current)

@@ -4,10 +4,10 @@
        "type": "leaf",
        "value": "2026-02-16T00:00:00.000Z",
      },
      Object {
        "type": "leaf",
-       "value": "2026-02-23T00:00:00.000Z",
+       "value": "2026-02-19T17:15:01.000Z",
      },
    ],
    "type": "and",
  }
```

---

## Prompt

```
credit card payments above 1000 DKK in the last 30 days
```

Unchanged: 3, Changed: 1

```diff
- date-range (previous)
+ date-range (current)

  Object {
    "children": Array [
      Object {
        "type": "leaf",
-       "value": "2026-01-20T17:14:45.000Z",
+       "value": "2026-01-20T00:00:00.000Z",
      },
      Object {
        "type": "leaf",
-       "value": "2026-02-19T17:14:45.000Z",
+       "value": "2026-02-19T00:00:00.000Z",
      },
    ],
    "type": "and",
  }
```

---

## Prompt

```
mobilepay payments from the last 7 days
```

Unchanged: 1, Changed: 1

```diff
- date-range (previous)
+ date-range (current)

  Object {
    "children": Array [
      Object {
        "type": "leaf",
-       "value": "2026-02-12T17:14:46GMT+0100",
+       "value": "2026-02-12T17:15:04.000Z",
      },
      Object {
        "type": "leaf",
-       "value": "2026-02-19T17:14:46GMT+0100",
+       "value": "2026-02-19T17:15:04.000Z",
      },
    ],
    "type": "and",
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
-   "value": "WAITING_FOR_PAYMENT",
+   "value": Array [
+     "INITIALIZING",
+     "WAITING_FOR_PAYMENT",
+     "PRE_FLIGHT_CHECK",
+   ],
  }
```

