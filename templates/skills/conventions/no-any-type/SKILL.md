---
name: no-any-type
description: Prohibit `any` type — use `unknown` or explicit types
id: no-any-type
level: 3
triggers: ["any", "type", "typescript", "unknown"]
source: TypeScript strict mode
version: 1.0.0
---

# no-any-type

## Triggers
TypeScript files using `any` type annotations.

## Context
`any` disables type checking entirely, defeating the purpose of TypeScript. This is an L3 Hard-Rule enforced at write-time by `hooks/lib/l3-rules.cjs`.

## Best Practices
```typescript
// ✅ Use unknown for truly unknown values
function parse(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("expected string");
  return raw;
}

// ✅ Use explicit union types
type Result = { data: User } | { error: string };

// ✅ Use generics
function identity<T>(x: T): T { return x; }
```

## Anti-Patterns
```typescript
// ❌ any type annotation
const data: any = fetch("/api");

// ❌ any cast
const user = response as any;

// ❌ Generic any
const map: Record<string, any> = {};
```
