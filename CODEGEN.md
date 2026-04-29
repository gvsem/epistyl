# Epistyl Code Generation

Epistyl can generate a typed collaborative object wrapper from a YAML schema.

The generated file gives users a class-like API over the CRDT runtime, while the schema remains the source of truth for object fields and merge semantics.

## Workflow

1. Write a YAML schema.
2. Run the generator.
3. Import the generated TypeScript file.
4. Use the generated harness to mutate, merge, and view the collaborative object.

## CLI

```bash
epistyl generate --schema ./epistyl/calendar.yaml --out-dir ./src/generated
```

During local development in this repository:

```bash
node --import tsx src/cli.ts generate \
  --schema tests/codegen/fixtures/calendar.yaml \
  --out-dir ./tmp/generated \
  --package-import ./src/index.ts
```

## YAML Schema

The v1 schema format is intentionally explicit. There is no shorthand syntax.

```yaml
name: CalendarEvent

root:
  type: object
  fields:
    title:
      type: primitive
      valueType: string
      semantics: mv

    description:
      type: primitive
      valueType: string
      semantics: lww

    organizer:
      type: ref
      semantics: lww

    tags:
      type: set
      element:
        type: primitive
        valueType: string
        semantics: lww

    attendees:
      type: array
      element:
        type: ref
        semantics: lww
```

## Generated Output

For a schema named `CalendarEvent`, the generator writes:

```text
CalendarEvent.ts
```

The generated module exports:

```ts
export interface CalendarEventOptions
export type CalendarEventView
export function createCalendarEventInitialRoot(): NodeState
export class CalendarEventHarness
```

## Usage

```ts
import {CalendarEventHarness} from "./generated/CalendarEvent";

const calendar = new CalendarEventHarness({
  replicaId: "A",
  objectId: "event-1",
});

calendar
  .setTitle("Team Sync")
  .setDescription("Weekly planning")
  .setOrganizer("user-1")
  .addTag("team")
  .insertAttendee("user-2");

const view = calendar.view();
```

Generated methods are derived from the schema:

- `primitive` fields generate `set<Field>(value)`
- `ref` fields generate `set<Field>(objectId)`
- nested fields generate names such as `setLocationRoom(value)`
- `set` fields generate `add<Singular>(value)` and `remove<Singular>(value)`
- `array` fields generate `insert<Singular>(value, index?)` and `remove<Singular>At(index)`

## Supported Schema Model

The v1 code generator supports:

- root `object`
- nested `object`
- `primitive`
- `ref`
- `set<primitive>`
- `set<ref>`
- `array<primitive>`
- `array<ref>`

Primitive value types:

- `string`
- `number`
- `boolean`
- `null`

Required semantics for leaf values:

- `lww`
- `mv`

## v1 Limitations

The v1 generator does not support:

- root `array`, `set`, `primitive`, or `ref`
- implicit semantics
- shorthand YAML syntax
- collection of object
- nested collections
- generated business methods
- schema-driven validation rules
- referential integrity or dereference behavior
- transaction-specific generated API

Generated mutation methods currently use local action application under the hood.
