# Epistyl

**Epistyl** is an experimental CRDT runtime for building **event-sourced, eventually consistent collaborative systems**.

It provides:

- deterministic operation ordering
- conflict-free replicated data types (CRDTs)
- transaction history replay
- deterministic object materialization
- typed runtime model
- JSON-like view projection for applications

The goal of this project is to provide a **minimal but correct CRDT runtime** that can power collaborative systems like calendars, task trackers, and document editors.

---

# Features

- **Operation-based CRDT model**
- **Vector clocks for causal ordering**
- **Deterministic conflict resolution**
- **Multiple register semantics**
  - LWW (Last-Write-Wins)
  - MV (Multi-Value)
- **Composable CRDT containers**
  - Object
  - Map
  - Set
  - Array
- **Transaction-based operation history**
- **Deterministic state materialization**
- **JSON-like application views**

---

# Installation

```bash
npm install @gvsem/epistyl
```

---

# Core Concepts

Epistyl is built around a few core primitives.

## Operations

Every mutation is represented as an **operation**.

Operations are immutable records that contain:

- the **replica that produced the operation**
- the **vector clock snapshot**
- the **target object**
- the **domain action**

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

Operations are **totally ordered deterministically**, even when they are concurrent.

This guarantees that **every replica will materialize the same state**.

---

# Vector Clocks

Epistyl uses **vector clocks** to determine causal relationships.

```ts
type VectorClock = Record<string, number>
```

The runtime can determine whether operations are:

- `before`
- `after`
- `concurrent`
- `equal`

```ts
compareClocks(a, b)
```

This allows the runtime to safely merge operations coming from multiple replicas.

---

# CRDT Node Model

Epistyl represents objects as a **tree of CRDT nodes**.

Nodes can be either:

### Leaf nodes

| Kind | Description |
|-----|------|
| primitive | numbers, strings, booleans |
| ref | reference to another object |

### Container nodes

| Kind | Description |
|-----|------|
| object | structured fields |
| map | key-value dictionary |
| set | OR-Set |
| array | ordered sequence |

Example node state:

```ts
{
  kind: "object",
  state: {
    fields: {
      title: { node: PrimitiveNodeState },
      tags: { node: SetNodeState }
    }
  }
}
```

---

# Register Semantics

Leaf values can use different **conflict resolution semantics**.

## LWW — Last Write Wins

Only the causally latest value survives.

```ts
{
  description: "Planning v3"
}
```

## MV — Multi Value Register

Concurrent values are preserved.

```ts
{
  title: {
    kind: "mv",
    values: [
      "Team Sync",
      "Weekly Sync"
    ]
  }
}
```

---

# Runtime Architecture

Epistyl is organized into a small set of layers.

```
core/
  clock.ts

ops/
  action.ts
  operation.ts
  transaction.ts

crdt/
  register.ts
  object.ts
  map.ts
  set.ts
  array.ts
  state.ts

runtime/
  apply.ts
  replica.ts
  materializer.ts
  view.ts
```

---

# Replica State

Each replica maintains:

```ts
interface ReplicaState {
  replicaId: string
  clockState: ClockState
  objects: Record<ObjectId, ObjectHistory>
}
```

Replica state stores:

- the **local vector clock**
- the **history of operations per object**

---

# Applying Local Changes

Local changes produce new operations.

```ts
const issued = issueOperation(replica, action)

replica = appendOperation(
  issued.replica,
  issued.operation
)
```

For convenience this is often wrapped:

```ts
function applyLocalAction(replica, objectId, action) {
  const issued = issueOperation(replica, action)
  return appendOperation(issued.replica, issued.operation)
}
```

---

# Replica Merging

Replicas exchange operation histories and merge them.

```ts
const merged = mergeReplicaStates(replicaA, replicaB)
```

The merge process:

1. unions object histories
2. deduplicates operations
3. sorts operations deterministically
4. merges vector clocks

---

# Deterministic Materialization

The runtime can reconstruct the current object state by **replaying operations**.

```ts
const result = materializeReplicaObject(
  replica,
  objectId,
  {
    applyContext
  }
)
```

Materialization is deterministic across replicas.

---

# JSON View Projection

Applications rarely want CRDT internal structures.

Epistyl provides **views** that convert CRDT state into JSON-like objects.

```ts
const view = viewNode(materialized.root)
```

Example result:

```ts
{
  title: {
    kind: "mv",
    values: ["Team Sync", "Weekly Sync"]
  },
  attendees: [
    { type: "ref", objectId: "user-2" },
    { type: "ref", objectId: "user-3" }
  ],
  tags: ["team", "planning"]
}
```

---

# Example: Collaborative Calendar Event

Below is a simplified example showing two replicas editing the same calendar event.

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
  materializeReplicaObject(
    merged,
    "event-1",
    { applyContext }
  ).root
)

console.log(view)
```

Result:

```ts
{
  title: {
    kind: "mv",
    values: ["Team Sync", "Weekly Sync"]
  }
}
```

---

# Debugging Replica State

Replica state can be inspected at any time.

```ts
console.log(
  JSON.stringify(
    exportReplicaState(replica),
    null,
    2
  )
)
```

Or inspect the materialized view:

```ts
console.log(
  JSON.stringify(viewNode(result.root), null, 2)
)
```

---

# Testing Scenarios

The project includes extensive tests covering:

- causal ordering
- register semantics
- set convergence
- array ordering
- map conflict resolution
- replica merges
- deterministic materialization

Example integration scenario:

```ts
replicaA.addTag("urgent")
replicaB.addTag("planning")

const merged = mergeReplicaStates(replicaA, replicaB)

expect(view.tags).toEqual([
  "planning",
  "urgent"
])
```

---

# Design Goals

Epistyl aims to be:

- **minimal**
- **deterministic**
- **correct**
- **type-safe**
- **event-sourced**

It is designed primarily as:

- a **CRDT reference implementation**
- a **foundation for collaborative systems**
- a **teaching tool for distributed state models**

---

# Status

Epistyl is currently **experimental**.

The API may change while the runtime evolves.

---

# License

MIT