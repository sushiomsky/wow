# Wizard of Wor Multiplayer Battle Royale
## Feature and Game Rules Specification

Based on the extracted project notes and rules from the uploaded context.

---

# 1. Mode Name

**Wizard of Wor: Endless Connected Dungeon Battle Royale**

Alternative internal name:

**Multiplayer — Endless Connected Dungeon**

---

# 2. Core Design Goal

The mode must preserve the original Wizard of Wor gameplay as much as possible.

The multiplayer system must extend the original game with:

- multiple dungeon instances,
- per-player home dungeons,
- connected tunnels,
- PvP,
- dungeon collapse after final death,
- endless dungeon replacement.

The implementation must not turn the game into a different genre or remove the original movement, shooting, monster behavior, dungeon feel, or game pacing unless explicitly required by the multiplayer rules.

---

# 3. Core Features

## 3.1 Per-Player Home Dungeon

Each player owns exactly one **home dungeon**.

When a player joins:

1. The server creates a new player.
2. The server creates a new dungeon instance for that player.
3. That dungeon becomes the player’s home dungeon.
4. The player spawns at the normal spawn position inside their own home dungeon.

A new player must never be spawned into another player’s home dungeon as their starting location.

### Verification Conditions

An implementation satisfies this feature if:

- every player has a `homeDungeonId`,
- every player’s `homeDungeonId` points to a unique dungeon initially created for that player,
- a newly joined player starts in their own dungeon,
- two players joining the same match do not share the same initial home dungeon.

---

## 3.2 Dungeon Network

Active dungeons form a connected dungeon network.

When more than one player exists, dungeons may be connected through left/right escape tunnels.

The network may be implemented as:

- a ring,
- a chain,
- a random graph,
- or another valid topology,

as long as the following rules are respected:

- each active player has their own home dungeon,
- active dungeons can be reached through tunnel traversal,
- destroyed dungeons are removed from the network,
- tunnel links are updated when dungeons are added or removed.

### Verification Conditions

An implementation satisfies this feature if:

- there is a server-side structure representing dungeon instances,
- there is a server-side structure representing tunnel links between dungeons,
- new player dungeons are added to the network,
- removed dungeons are disconnected safely,
- players can travel from one dungeon to another through valid tunnel links.

---

## 3.3 Tunnel Travel

Players can use left/right tunnels to travel between connected dungeons.

When a player enters a connected tunnel:

1. The server checks whether the tunnel has an external link.
2. If yes, the player is transferred to the linked dungeon.
3. The player exits at the corresponding tunnel exit.
4. The player’s `currentDungeonId` is updated.

If no external dungeon connection exists, the tunnel behaves like the original same-dungeon tunnel.

### Verification Conditions

An implementation satisfies this feature if:

- player tunnel traversal is server-authoritative,
- entering a linked tunnel changes the player’s current dungeon,
- entering an unlinked tunnel keeps original tunnel behavior,
- player position is updated to a valid exit position,
- tunnel traversal cannot teleport a player into a destroyed dungeon.

---

## 3.4 Monster Tunnel Behavior

Monsters must preserve original Wizard of Wor tunnel behavior.

Monsters may use tunnels inside their current dungeon, but they must not travel to other players’ dungeons through connected dungeon-network tunnels.

Player tunnel travel and monster tunnel travel are separate systems.

### Verification Conditions

An implementation satisfies this feature if:

- monsters remain assigned to one dungeon,
- monsters never change `currentDungeonId` through player network links,
- monsters can still use original same-dungeon tunnel mechanics where appropriate,
- monsters from dungeon A cannot appear in dungeon B through connected player tunnels.

---

## 3.5 PvP

PvP is always enabled.

When two or more players are in the same dungeon, they can shoot each other.

Bullet handling must be server-authoritative.

A bullet must track:

- owner player id,
- current dungeon id,
- position,
- direction,
- speed,
- lifetime,
- collision target.

A player must not be damaged by their own bullet unless self-hit is explicitly added later.

### Verification Conditions

An implementation satisfies this feature if:

- bullets are created server-side or validated server-side,
- bullets collide with enemy players in the same dungeon,
- bullets do not hit players in other dungeons,
- player death from PvP is handled by the same life/death system as other player deaths,
- the client cannot fake hits directly.

---

## 3.6 Player Lives and Death

Each player has a finite number of lives.

A player can die because of:

- monster collision,
- enemy player bullet,
- collapse timeout penalty,
- other explicitly defined hazards.

When a player dies but still has lives remaining:

1. The player loses one life.
2. The player enters a temporary dead or respawning state.
3. The player respawns at their own home dungeon.
4. The player respawns at the fixed normal spawn position.

When a player has no lives remaining:

1. The player enters `FINAL_DEAD` or `ELIMINATED`.
2. Their home dungeon enters collapse mode.
3. The player no longer participates as an active combatant unless spectator mode is implemented.

### Verification Conditions

An implementation satisfies this feature if:

- every player has a life counter,
- normal death decrements lives,
- non-final death causes respawn in the player’s own home dungeon,
- final death triggers elimination,
- final death triggers collapse of the eliminated player’s home dungeon.

---

## 3.7 Home Respawn Rule

A player must always respawn in their own home dungeon.

Even if the player died inside another player’s dungeon, they return to their own home dungeon.

### Verification Conditions

An implementation satisfies this feature if:

- after death, `currentDungeonId` becomes `homeDungeonId`,
- the respawn position is the normal home spawn position,
- a player does not respawn in the dungeon where they died unless that dungeon is also their own home dungeon.

---

## 3.8 Dungeon Clearing and Endless Replacement

A dungeon can be cleared according to original Wizard of Wor rules.

When a dungeon is cleared:

1. The clear event is detected server-side.
2. The dungeon enters a cleared or replacing state.
3. A next dungeon is generated or loaded.
4. The dungeon owner relationship is preserved if appropriate.
5. Tunnel links are updated safely.
6. Players are kept in valid positions.

The game mode should continue indefinitely instead of ending when one dungeon is cleared.

### Verification Conditions

An implementation satisfies this feature if:

- dungeon clear detection exists,
- clearing a dungeon does not end the entire multiplayer match,
- a replacement dungeon or next level is created,
- active players remain valid after replacement,
- tunnel links do not point to stale dungeon data.

---

# 4. Battle Royale Collapse System

## 4.1 Collapse Trigger

A dungeon enters collapse mode when its owner reaches final death.

The collapse applies to the eliminated owner’s home dungeon.

### Verification Conditions

An implementation satisfies this feature if:

- only owner final death triggers home dungeon collapse,
- normal temporary death does not trigger collapse,
- collapse starts on the correct dungeon,
- collapse state is visible in server state.

---

## 4.2 Collapse Countdown

When a dungeon enters collapse mode:

1. A 60-second countdown starts.
2. Players inside the dungeon are warned.
3. The dungeon remains playable during the countdown.
4. The dungeon is not instantly destroyed.

The countdown value must be configurable, but the default rule is:

```text
collapseCountdownSeconds = 60
```

### Verification Conditions

An implementation satisfies this feature if:

- collapse starts a timer,
- the timer duration defaults to 60 seconds,
- the timer is included in server state or snapshots,
- clients can display the remaining collapse time,
- the dungeon is not removed immediately on collapse start.

---

## 4.3 One-Way Outward Tunnels During Collapse

During collapse, tunnels from the collapsing dungeon become one-way outward.

Players may leave the collapsing dungeon.

Players may not enter the collapsing dungeon through tunnels once collapse has started.

### Verification Conditions

An implementation satisfies this feature if:

- tunnel links from the collapsing dungeon remain usable outward,
- tunnel links into the collapsing dungeon are blocked,
- players outside cannot enter the collapsing dungeon,
- players inside still have a valid escape path if tunnels exist.

---

## 4.4 Collapse Timeout Penalty

When the 60-second countdown expires:

Every player still inside the collapsing dungeon must:

1. lose one life,
2. be removed from the collapsing dungeon,
3. respawn at their own home dungeon if they still have lives,
4. become eliminated if that life loss causes final death.

This penalty applies to all non-owner players still inside the collapsing dungeon.

### Verification Conditions

An implementation satisfies this feature if:

- timeout checks all players inside the collapsing dungeon,
- each remaining player loses one life,
- surviving players respawn at their own home dungeon,
- players whose lives reach zero become eliminated,
- no player remains trapped inside the collapsing dungeon after timeout handling.

---

## 4.5 Dungeon Destruction

A collapsing dungeon must only be destroyed after all players and monsters inside it are gone or safely resolved.

The dungeon should not be deleted while unresolved gameplay entities still exist inside it.

A dungeon is destruction-ready when:

```text
state == COLLAPSING or EVACUATING
and playersInside == 0
and monstersInside == 0
```

or when timeout handling has explicitly removed or resolved all remaining entities.

### Verification Conditions

An implementation satisfies this feature if:

- destruction does not occur instantly at final death,
- destruction waits for evacuation or timeout resolution,
- no active player remains inside a destroyed dungeon,
- no monster remains inside a destroyed dungeon unless intentionally discarded by cleanup logic,
- tunnel links to the destroyed dungeon are removed.

---

# 5. Singleplayer Compatibility

If only one player is active, the game must behave like original Wizard of Wor.

Singleplayer behavior must not require multiplayer networking, extra dungeon traversal, PvP logic, or foreign dungeon instances.

### Verification Conditions

An implementation satisfies this feature if:

- the original singleplayer mode still loads,
- original movement works,
- original shooting works,
- original monster behavior works,
- original same-dungeon tunnel behavior works,
- multiplayer additions do not break existing singleplayer play.

---

# 6. Server Authority Rules

The multiplayer server must be authoritative.

Clients may send:

- input state,
- movement intent,
- shoot intent,
- join request,
- display name,
- optional cosmetic data.

Clients must not authoritatively decide:

- player position,
- bullet hits,
- monster hits,
- PvP damage,
- dungeon clearing,
- collapse state,
- respawn state,
- life count,
- score,
- tunnel destination.

### Verification Conditions

An implementation satisfies this feature if:

- server owns all critical game state,
- clients send inputs, not final positions,
- server broadcasts snapshots,
- collision detection happens server-side,
- PvP damage happens server-side,
- dungeon state transitions happen server-side.

---

# 7. Main Entity Model

## 7.1 GameServer

The `GameServer` owns the authoritative match state.

It should manage:

```text
players
dungeons
tunnelLinks
serverTick
inputQueue
snapshotBroadcast
matchState
```

Required responsibilities:

- accept players,
- create home dungeons,
- connect dungeon network,
- receive input,
- tick players,
- tick monsters,
- tick bullets,
- resolve collisions,
- resolve PvP,
- resolve deaths,
- resolve respawns,
- resolve dungeon clearing,
- resolve dungeon collapse,
- broadcast snapshots.

---

## 7.2 Player

A player should contain at least:

```text
id
name
socketId
homeDungeonId
currentDungeonId
position
direction
lives
score
inputState
combatState
respawnState
aliveState
shootCooldown
```

Recommended player states:

```text
CONNECTING
ACTIVE
DEAD
RESPAWNING
FINAL_DEAD
SPECTATING
DISCONNECTED
```

---

## 7.3 Dungeon

A dungeon should contain at least:

```text
id
ownerPlayerId
state
levelIndex
playersInside
monsters
bullets
leftTunnel
rightTunnel
collapseStartedAt
collapseEndsAt
clearState
destructionReady
```

Recommended dungeon states:

```text
CREATING
ACTIVE
CLEARED
REPLACING
COLLAPSING
EVACUATING
EMPTY
DESTROYED
```

---

## 7.4 Tunnel Link

A tunnel link should contain at least:

```text
fromDungeonId
fromSide
toDungeonId
toSide
directionMode
enabled
```

Recommended tunnel directions:

```text
TWO_WAY
ONE_WAY_OUT
BLOCKED
SAME_DUNGEON_ONLY
```

---

## 7.5 Bullet

A bullet should contain at least:

```text
id
ownerPlayerId
dungeonId
position
direction
speed
lifetime
active
```

---

## 7.6 Monster

A monster should contain at least:

```text
id
dungeonId
type
position
direction
state
alive
```

Important rule:

```text
monster.dungeonId must not change through connected player tunnel links
```

---

# 8. Player State Machine

## 8.1 Player States

```text
CONNECTING
  The client has connected, but the player is not fully initialized.

ACTIVE
  The player is alive and can move, shoot, enter tunnels, fight monsters, and fight other players.

DEAD
  The player has just died. Life has been deducted or is about to be deducted.

RESPAWNING
  The player is waiting for respawn placement.

FINAL_DEAD
  The player has no lives remaining and is eliminated.

SPECTATING
  Optional state after final death.

DISCONNECTED
  The player has lost connection or left the match.
```

---

## 8.2 Player State Transitions

```text
CONNECTING
  -> ACTIVE
     when player object and home dungeon have been created

ACTIVE
  -> DEAD
     when player is killed by monster, PvP bullet, collapse timeout, or other hazard

DEAD
  -> RESPAWNING
     when player still has lives remaining after life deduction

DEAD
  -> FINAL_DEAD
     when player has no lives remaining

RESPAWNING
  -> ACTIVE
     when player has been placed at home dungeon spawn

FINAL_DEAD
  -> SPECTATING
     if spectator mode exists

ACTIVE
  -> DISCONNECTED
     when player disconnects

SPECTATING
  -> DISCONNECTED
     when player disconnects
```

---

## 8.3 Player State Machine Table

| Current State | Event | Condition | Next State | Required Action |
|---|---|---|---|---|
| CONNECTING | Join accepted | Home dungeon created | ACTIVE | Spawn player in own home dungeon |
| ACTIVE | Hit by monster | lives > 1 | DEAD | Deduct life |
| ACTIVE | Hit by PvP bullet | lives > 1 | DEAD | Deduct life |
| ACTIVE | Collapse timeout | lives > 1 | DEAD | Deduct life and remove from collapsing dungeon |
| DEAD | Life deducted | lives > 0 | RESPAWNING | Prepare home respawn |
| RESPAWNING | Respawn ready | home dungeon valid | ACTIVE | Place at home spawn |
| ACTIVE | Fatal damage | lives <= 1 before deduction | FINAL_DEAD | Trigger owner home dungeon collapse |
| FINAL_DEAD | Spectator enabled | true | SPECTATING | Switch to spectator |
| ACTIVE | Disconnect | socket closed | DISCONNECTED | Remove or mark player |
| SPECTATING | Disconnect | socket closed | DISCONNECTED | Remove spectator |

---

# 9. Dungeon State Machine

## 9.1 Dungeon States

```text
CREATING
  Dungeon is being initialized.

ACTIVE
  Dungeon is playable.

CLEARED
  Dungeon has been cleared according to original Wizard of Wor rules.

REPLACING
  Dungeon is being replaced by the next dungeon.

COLLAPSING
  Dungeon owner has reached final death and countdown has started.

EVACUATING
  Collapse countdown has expired and remaining players/entities are being resolved.

EMPTY
  Dungeon contains no players and no monsters.

DESTROYED
  Dungeon has been removed from the active dungeon network.
```

---

## 9.2 Dungeon State Transitions

```text
CREATING
  -> ACTIVE
     when map, monsters, tunnels, and spawn data are initialized

ACTIVE
  -> CLEARED
     when original clear condition is met

CLEARED
  -> REPLACING
     when next dungeon generation begins

REPLACING
  -> ACTIVE
     when replacement dungeon is ready

ACTIVE
  -> COLLAPSING
     when owner reaches final death

COLLAPSING
  -> EVACUATING
     when collapse countdown expires

COLLAPSING
  -> EMPTY
     when all players and monsters leave before timeout

EVACUATING
  -> EMPTY
     when all remaining players and monsters are resolved

EMPTY
  -> DESTROYED
     when tunnel links are removed and cleanup is safe
```

---

## 9.3 Dungeon State Machine Table

| Current State | Event | Condition | Next State | Required Action |
|---|---|---|---|---|
| CREATING | Init complete | Dungeon valid | ACTIVE | Add dungeon to active network |
| ACTIVE | Clear detected | Monsters defeated / original clear condition | CLEARED | Freeze clear result |
| CLEARED | Replacement started | Next level available | REPLACING | Generate/load next dungeon |
| REPLACING | Replacement complete | Dungeon valid | ACTIVE | Reconnect tunnels |
| ACTIVE | Owner final death | owner.lives == 0 | COLLAPSING | Start 60s countdown |
| COLLAPSING | Collapse started | always | COLLAPSING | Set tunnels one-way outward |
| COLLAPSING | Countdown expired | playersInside > 0 | EVACUATING | Penalize and respawn remaining players |
| COLLAPSING | Dungeon empty | playersInside == 0 and monstersInside == 0 | EMPTY | Mark destruction-ready |
| EVACUATING | Entities resolved | playersInside == 0 and monstersInside == 0 | EMPTY | Mark destruction-ready |
| EMPTY | Cleanup complete | tunnel links removed | DESTROYED | Remove dungeon from active map |

---

# 10. Tunnel State Machine

## 10.1 Tunnel States

```text
SAME_DUNGEON_ONLY
  Tunnel behaves like original Wizard of Wor tunnel.

CONNECTED_TWO_WAY
  Tunnel connects two active dungeons in both directions.

ONE_WAY_OUT
  Tunnel allows leaving a collapsing dungeon but blocks entry into it.

BLOCKED
  Tunnel is disabled.

STALE
  Tunnel points to a removed or invalid dungeon and must be repaired.
```

---

## 10.2 Tunnel Transitions

```text
SAME_DUNGEON_ONLY
  -> CONNECTED_TWO_WAY
     when dungeon is linked to another active dungeon

CONNECTED_TWO_WAY
  -> ONE_WAY_OUT
     when one side enters collapse

CONNECTED_TWO_WAY
  -> STALE
     when linked dungeon is destroyed unexpectedly

ONE_WAY_OUT
  -> BLOCKED
     when collapsing dungeon is destroyed

STALE
  -> CONNECTED_TWO_WAY
     when tunnel network is repaired

STALE
  -> SAME_DUNGEON_ONLY
     when no valid external link exists
```

---

# 11. Match Flow

## 11.1 Join Flow

```text
1. Client connects to multiplayer server.
2. Server creates player.
3. Server creates unique home dungeon.
4. Server places player in home dungeon.
5. Server connects new dungeon to active dungeon network if other dungeons exist.
6. Server sends initial snapshot.
```

---

## 11.2 Normal Gameplay Flow

```text
1. Client sends input.
2. Server updates player movement.
3. Server updates bullets.
4. Server updates monsters.
5. Server resolves collisions.
6. Server resolves PvP.
7. Server checks dungeon clear conditions.
8. Server checks player death conditions.
9. Server checks tunnel traversal.
10. Server broadcasts snapshot.
```

---

## 11.3 Player Death Flow

```text
1. Server detects player death.
2. Server deducts one life.
3. If lives remain:
   - move player to RESPAWNING,
   - place player in own home dungeon,
   - return player to ACTIVE.
4. If no lives remain:
   - move player to FINAL_DEAD,
   - trigger collapse of that player’s home dungeon.
```

---

## 11.4 Dungeon Collapse Flow

```text
1. Owner reaches final death.
2. Owner home dungeon enters COLLAPSING.
3. Collapse countdown starts at 60 seconds.
4. Dungeon tunnels become one-way outward.
5. Entry into collapsing dungeon is blocked.
6. Players inside may escape.
7. When countdown expires:
   - remaining players lose one life,
   - remaining players respawn at their own home dungeon,
   - players reduced to zero lives become eliminated.
8. Dungeon waits until players and monsters are gone or resolved.
9. Dungeon becomes EMPTY.
10. Tunnel links are removed.
11. Dungeon becomes DESTROYED.
```

---

# 12. Snapshot Requirements

The server should broadcast enough state for the client to render the game correctly.

A snapshot should include:

```text
serverTime
tick
localPlayerId
players
dungeonsVisibleToClient
currentDungeonId
monsters
bullets
tunnelState
collapseState
scoreboard
```

For each visible dungeon:

```text
dungeonId
ownerPlayerId
state
playersInside
monsters
bullets
leftTunnelState
rightTunnelState
collapseRemainingSeconds
```

For each player:

```text
id
name
currentDungeonId
position
direction
lives
score
aliveState
```

---

# 13. Required Manual Tests

An implementation should be considered valid only if these tests pass.

## Test 1 — Singleplayer Still Works

Expected result:

```text
Original singleplayer page loads and plays normally.
```

Must verify:

- movement,
- shooting,
- monsters,
- original tunnels,
- clearing behavior.

---

## Test 2 — Multiplayer Server Starts

Expected result:

```text
Server starts without errors and accepts WebSocket connections.
```

---

## Test 3 — First Player Gets Own Dungeon

Expected result:

```text
Player A joins and receives dungeon A as home dungeon.
```

Must verify:

```text
playerA.homeDungeonId == dungeonA.id
playerA.currentDungeonId == dungeonA.id
```

---

## Test 4 — Second Player Gets Separate Dungeon

Expected result:

```text
Player B joins and receives dungeon B as home dungeon.
```

Must verify:

```text
playerB.homeDungeonId == dungeonB.id
playerB.currentDungeonId == dungeonB.id
playerA.homeDungeonId != playerB.homeDungeonId
```

---

## Test 5 — Dungeons Become Connected

Expected result:

```text
Dungeon A and dungeon B have at least one valid tunnel link.
```

---

## Test 6 — Player Can Travel Between Dungeons

Expected result:

```text
Player A enters connected tunnel in dungeon A and exits in dungeon B.
```

Must verify:

```text
playerA.currentDungeonId changes from dungeonA.id to dungeonB.id
```

---

## Test 7 — Monsters Do Not Cross Dungeons

Expected result:

```text
Monster from dungeon A never appears in dungeon B through connected player tunnel.
```

Must verify:

```text
monster.dungeonId remains unchanged
```

---

## Test 8 — PvP Works

Expected result:

```text
Two players in same dungeon can shoot each other.
```

Must verify:

- bullet belongs to shooter,
- bullet exists in current dungeon,
- enemy player can be hit,
- life is deducted server-side.

---

## Test 9 — Respawn Goes To Home Dungeon

Expected result:

```text
Player killed in another dungeon respawns in their own home dungeon.
```

Must verify:

```text
afterRespawn.currentDungeonId == player.homeDungeonId
```

---

## Test 10 — Cleared Dungeon Is Replaced

Expected result:

```text
Clearing a dungeon creates or loads the next dungeon instead of ending the match.
```

---

## Test 11 — Owner Final Death Triggers Collapse

Expected result:

```text
When player A reaches final death, player A’s home dungeon enters COLLAPSING.
```

Must verify:

```text
dungeonA.ownerPlayerId == playerA.id
dungeonA.state == COLLAPSING
```

---

## Test 12 — Collapse Countdown Is 60 Seconds

Expected result:

```text
Collapse timer starts at 60 seconds by default.
```

---

## Test 13 — Collapse Makes Tunnels One-Way Out

Expected result:

```text
Players inside collapsing dungeon can leave.
Players outside cannot enter.
```

---

## Test 14 — Timeout Penalizes Remaining Players

Expected result:

```text
Players still inside after countdown lose one life and respawn home.
```

Must verify:

```text
player.lives decreases by 1
player.currentDungeonId == player.homeDungeonId
```

---

## Test 15 — Dungeon Destroyed Only After Safe Cleanup

Expected result:

```text
Dungeon is destroyed only after players and monsters are gone or resolved.
```

Must verify:

```text
playersInside == 0
monstersInside == 0
state == DESTROYED
```

---

# 14. LLM Verification Prompt

Use this prompt to verify an implementation:

```text
You are verifying an implementation of a Wizard of Wor multiplayer battle royale mode called “Endless Connected Dungeon”.

Your task is to inspect the code and decide whether the implementation satisfies the required game rules and state machines.

Core goal:
The original Wizard of Wor gameplay must be preserved. Multiplayer should extend the original game with connected dungeon instances, not replace the original mechanics.

Required features:
1. Each player gets a unique home dungeon on join.
2. New players must not spawn into existing players’ home dungeons.
3. Active dungeons form a connected network through left/right tunnels.
4. Players can travel between connected dungeons through tunnels.
5. If no external dungeon link exists, tunnel behavior remains original same-dungeon behavior.
6. Monsters may use original same-dungeon tunnel behavior, but must not travel between player dungeons.
7. PvP is always enabled when players are in the same dungeon.
8. Bullet movement, collision, PvP damage, monster damage, deaths, respawns, scoring, tunnel travel, dungeon clearing, and collapse handling must be server-authoritative.
9. A player who dies but still has lives respawns at their own home dungeon.
10. A player who reaches final death becomes eliminated.
11. Owner final death triggers collapse of that owner’s home dungeon.
12. Collapse starts a 60-second countdown.
13. During collapse, tunnels become one-way outward: players can leave but cannot enter the collapsing dungeon.
14. Players still inside after the countdown lose one life and respawn at their own home dungeon.
15. A collapsing dungeon is destroyed only after all players and monsters are gone or safely resolved.
16. Cleared dungeons are replaced with next dungeons so the mode can continue endlessly.
17. Singleplayer mode must still work like original Wizard of Wor.

Expected state machines:

Player states:
CONNECTING -> ACTIVE -> DEAD -> RESPAWNING -> ACTIVE
ACTIVE -> FINAL_DEAD when lives reach zero
FINAL_DEAD -> SPECTATING if spectator mode exists
Any active client may become DISCONNECTED on socket close.

Dungeon states:
CREATING -> ACTIVE
ACTIVE -> CLEARED -> REPLACING -> ACTIVE
ACTIVE -> COLLAPSING on owner final death
COLLAPSING -> EVACUATING when countdown expires
COLLAPSING or EVACUATING -> EMPTY when all players and monsters are gone or resolved
EMPTY -> DESTROYED after tunnel cleanup

Tunnel states:
SAME_DUNGEON_ONLY
CONNECTED_TWO_WAY
ONE_WAY_OUT
BLOCKED
STALE

Verify the code against these conditions. For each rule, answer:
- PASS, FAIL, or PARTIAL
- evidence from code
- missing pieces
- risk level
- suggested fix

Do not assume a rule is satisfied unless the code clearly implements it.
```
