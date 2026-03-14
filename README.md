# Epistyl

**Epistyl** is an experimental CRDT runtime for **event-sourced replication of composite objects**.

It is designed for systems where objects are edited independently on multiple replicas and must later converge deterministically.

## Features

- operation-based CRDT model
- vector clocks for causal ordering
- explicit `LWW` and `MV` register semantics
- composable node types:
  - `object`
  - `set`
  - `array`
  - `primitive`
  - `ref`
- deterministic history replay
- replica merge support
- JSON-like materialized views
- transaction-aware operation history


## Core Model

Epistyl is built around a small pipeline:

```text
actions -> operations -> replica history -> materialization -> view
```

### Operation

Every local change is represented as an immutable operation.

```ts
export interface Operation {
  opId: string
  txId: string
  objectId: string
  replicaId: string
  clock: VectorClock
  action: Action
}
```

### Vector clocks

Vector clocks are used to detect:

- causal order
- concurrency
- equality

```ts
type VectorClock = Record<string, number>
```

### CRDT node graph

Objects are represented as a tree of typed CRDT nodes.

- leaf nodes:
  - `primitive`
  - `ref`
- container nodes:
  - `object`
  - `set`
  - `array`

This allows different fields of the same object to have different merge semantics.

## Register Semantics

Leaf nodes support two register modes.

### LWW

Last write wins.

```ts
{
  description: "Planning v3"
}
```

### MV

Concurrent values are preserved.

```ts
{
  title: {
    kind: "mv",
    values: ["Team Sync", "Weekly Sync"]
  }
}
```

## Runtime Structure

```text
src/
  core/
  ops/
  crdt/
  runtime/
```

Main runtime responsibilities:

- issue operations
- store replica history
- merge histories
- replay operations
- project JSON-like views

## Replica State

Each replica stores:

```ts
interface ReplicaState {
  replicaId: string
  clockState: ClockState
  objects: Record<ObjectId, ObjectHistory>
}
```

## Applying Local Changes

```ts
replica = applyLocalAction(replica, "event-1", {
  type: "field.set",
  path: ["title"],
  value: "Team Sync"
})
```

## Merging Replicas

```ts
const merged = mergeReplicaStates(replicaA, replicaB)
```

Merge combines histories and clocks, then materialization reconstructs the current object state.

## Materialization

```ts
const result = materializeReplicaObject(replica, "event-1", {
  applyContext
})
```

## View Projection

```ts
const view = viewNode(result.root)
```

Example:

```ts
{
  title: {
    kind: "mv",
    values: ["Team Sync", "Weekly Sync"]
  },
  tags: ["team", "planning"]
}
```

## Example

```ts
let replicaA = createReplicaState("A")
let replicaB = createReplicaState("B")

replicaA = applyLocalAction(replicaA, "event-1", {
  type: "field.set",
  path: ["title"],
  value: "Team Sync"
})

replicaB = applyLocalAction(replicaB, "event-1", {
  type: "field.set",
  path: ["title"],
  value: "Weekly Sync"
})

const merged = mergeReplicaStates(replicaA, replicaB)

const view = viewNode(
  materializeReplicaObject(merged, "event-1", {
    applyContext
  }).root
)
```

## Design Goals

Epistyl aims to be:

- deterministic
- minimal
- type-aware
- event-sourced
- suitable for domain object modeling

## Status

Experimental.

## License

MIT