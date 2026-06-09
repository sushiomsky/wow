import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { GameServer } = require('../../frontend/game/multiplayer/server/GameServer');
const { DungeonInstance, STATE } = require('../../frontend/game/multiplayer/server/DungeonInstance');
const { ServerPlayer } = require('../../frontend/game/multiplayer/server/ServerPlayer');
const { ServerBullet } = require('../../frontend/game/multiplayer/server/ServerBullet');
const { ServerMonster } = require('../../frontend/game/multiplayer/server/ServerMonster');
const { DungeonGraph } = require('../../frontend/game/multiplayer/server/DungeonGraph');

function makeServer() {
  const server = Object.create(GameServer.prototype);
  server.connections = new Map();
  server.dungeons = new Map();
  server.bots = new Map();
  server.battleRoyaleMode = false;
  server.removeBotsFromDungeon = () => {};
  server._sendInit = () => {};
  server._broadcastToDungeon = () => {};
  server._send = () => {};
  return server;
}

function addDungeon(server) {
  const dungeon = new DungeonInstance(server);
  server.dungeons.set(dungeon.id, dungeon);
  return dungeon;
}

function makeConn(player = null, dungeonId = null) {
  return { ws: { readyState: 1, send() {} }, player, dungeonId, inputs: {} };
}


function testEndlessPlayersGetSeparateConnectedHomes() {
  const server = makeServer();
  server.battleRoyaleMode = true;
  server.dungeonGraph = new DungeonGraph();
  const connA = makeConn();
  const connB = makeConn();
  server.connections.set('a', connA);
  server.connections.set('b', connB);

  server.endlessBRQueue = { activePlayers: new Map(), addPlayer: () => {}, removePlayer: () => {} };
  const { EndlessBRQueue } = require('../../frontend/game/multiplayer/server/EndlessBRQueue');
  server.endlessBRQueue = new EndlessBRQueue(server);
  server.endlessBRQueue.addPlayer('a', connA);
  server.endlessBRQueue.addPlayer('b', connB);

  assert.notEqual(connA.dungeonId, connB.dungeonId, 'endless players must receive separate home dungeons');
  assert.equal(connA.player.homeDungeonId, connA.dungeonId);
  assert.equal(connB.player.homeDungeonId, connB.dungeonId);
  const dungeonA = server.dungeons.get(connA.dungeonId);
  const dungeonB = server.dungeons.get(connB.dungeonId);
  assert.ok(dungeonA.leftTunnelTarget || dungeonA.rightTunnelTarget || dungeonB.leftTunnelTarget || dungeonB.rightTunnelTarget, 'homes should be tunnel-connected');
}

function testMonstersRemainInSourceDungeonOnPlayerTravel() {
  const server = makeServer();
  const source = addDungeon(server);
  const target = addDungeon(server);
  const monster = new ServerMonster('burwor', null, source);
  source.monsters.push(monster);
  const player = new ServerPlayer(0, source, 'p1', source.id);
  player.homeSlot = 0;
  player.status = 'alive';
  source.addPlayer(player);
  const conn = makeConn(player, source.id);
  server.connections.set('p1', conn);

  assert.equal(server.transferPlayerToDungeon(player, source, target.id, 'left'), true);
  assert.equal(source.monsters.includes(monster), true, 'monster stays in original dungeon');
  assert.equal(target.monsters.includes(monster), false, 'monster is not copied to target dungeon');
}

function testPlayerBulletPvPDeductsLifeServerSide() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const shooter = new ServerPlayer(0, dungeon, 'shooter', dungeon.id);
  const target = new ServerPlayer(1, dungeon, 'target', dungeon.id);
  shooter.status = 'alive';
  target.status = 'alive';
  target.lives = 3;
  dungeon.addPlayer(shooter);
  dungeon.addPlayer(target);
  shooter.bullet = new ServerBullet(shooter, target.x, target.y, 'right', dungeon);

  shooter.bullet.scanRoutine();
  assert.equal(target.status, 'dead', 'PvP bullet marks target dead');
  assert.equal(shooter.score, 1000, 'PvP shooter receives worrior score');
  target.frameCounters.dead = Math.round(dungeon.scanFPS * 2) + 1;
  target.scanRoutine({});
  assert.equal(target.lives, 2, 'dead player loses one life server-side');
}

function testForeignDeathRespawnsHomeAndClearsAwaySlot() {
  const server = makeServer();
  const home = addDungeon(server);
  const away = addDungeon(server);
  const visitor = new ServerPlayer(1, away, 'visitor', home.id);
  visitor.homeSlot = 0;
  visitor.status = 'dead';
  visitor.lives = 2;
  away.addPlayer(visitor);
  const conn = makeConn(visitor, away.id);
  server.connections.set('visitor', conn);

  away.respawnPlayer(visitor);
  assert.equal(conn.dungeonId, home.id);
  assert.equal(home.players.some((p) => p.id === 'visitor'), true, 'visitor appears in home dungeon');
  assert.equal(away.players.every((p) => p.id !== 'visitor'), true, 'away dungeon slot is cleared');
  assert.equal(conn.player.status, 'wait');
}

function testClearedDungeonContinuesToNextDungeon() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const player = new ServerPlayer(0, dungeon, 'p1', dungeon.id);
  player.status = 'alive';
  dungeon.addPlayer(player);
  dungeon.level = 1;
  dungeon.scene = 'dungeon';
  dungeon.endDungeon();
  assert.equal(dungeon.scene, 'getReady', 'clearing should continue via getReady instead of ending match');
  dungeon.nextDungeon();
  assert.equal(dungeon.scene, 'dungeon');
  assert.equal(dungeon.monsters.length, 6, 'next dungeon starts a fresh monster roster');
}

function testTransferPreservesHomeDungeon() {
  const server = makeServer();
  const home = addDungeon(server);
  const target = addDungeon(server);
  const player = new ServerPlayer(0, home, 'p1', home.id);
  player.homeSlot = 0;
  player.status = 'alive';
  player.lives = 2;
  home.addPlayer(player);
  const conn = makeConn(player, home.id);
  server.connections.set('p1', conn);

  const ok = server.transferPlayerToDungeon(player, home, target.id, 'left');
  assert.equal(ok, true);
  assert.equal(conn.dungeonId, target.id);
  assert.equal(conn.player.homeDungeonId, home.id, 'homeDungeonId must remain original home after travel');
  assert.equal(conn.player.homeSlot, 0, 'homeSlot must remain original slot after travel');
  assert.equal(conn.player.lives, 2);
  assert.equal(home.players.every((p) => p.id !== 'p1'), true);
  assert.equal(target.players.some((p) => p.id === 'p1'), true);
}

function testCollapseBlocksEntryButAllowsExit() {
  const server = makeServer();
  const collapsing = addDungeon(server);
  const safe = addDungeon(server);
  collapsing.lifecycleState = STATE.COLLAPSING;
  safe.lifecycleState = STATE.ACTIVE;

  assert.equal(server.isDungeonEntryBlocked(collapsing.id, safe.id), true, 'outside players may not enter collapsing dungeon');
  assert.equal(server.isDungeonEntryBlocked(safe.id, collapsing.id), false, 'players may leave collapsing dungeon outward');
}


function testTransferEvictsBotInsteadOfEndingMatch() {
  const server = makeServer();
  const source = addDungeon(server);
  const target = addDungeon(server);
  source.matchMode = 'endless_br';
  target.matchMode = 'endless_br';

  const traveler = new ServerPlayer(0, source, 'traveler', source.id);
  traveler.homeSlot = 0;
  traveler.status = 'alive';
  traveler.lives = 3;
  source.addPlayer(traveler);
  const conn = makeConn(traveler, source.id);
  server.connections.set('traveler', conn);

  const targetOwner = new ServerPlayer(0, target, 'owner', target.id);
  targetOwner.homeSlot = 0;
  targetOwner.status = 'alive';
  target.addPlayer(targetOwner);
  server.connections.set('owner', makeConn(targetOwner, target.id));

  const bot = server.spawnBot(target.id, 1);
  assert.ok(bot, 'target starts with filler bot');
  assert.equal(target.players[1].isBot, true);

  const ok = server.transferPlayerToDungeon(traveler, source, target.id, 'left');
  assert.equal(ok, true, 'traveler should enter target by evicting filler bot');
  assert.equal(conn.dungeonId, target.id);
  assert.equal(conn.player.id, 'traveler');
  assert.equal(conn.player.homeDungeonId, source.id, 'traveler keeps original home dungeon');
  assert.equal(conn.player.status, 'alive', 'traveler remains alive after tunnel transfer');
  assert.equal(target.players[1].id, 'traveler', 'traveler occupies released bot slot');
  assert.equal(server.bots.has(bot.id), false, 'evicted bot is removed from bot registry');
  assert.equal(server.dungeons.has(source.id), true, 'source home dungeon is not destroyed by travel');
}

function testCollapseTimeoutPenaltyRespawnsHome() {
  const server = makeServer();
  const collapsing = addDungeon(server);
  const home = addDungeon(server);
  const visitor = new ServerPlayer(1, collapsing, 'visitor', home.id);
  visitor.homeSlot = 0;
  visitor.status = 'alive';
  visitor.lives = 2;
  collapsing.addPlayer(visitor);
  const conn = makeConn(visitor, collapsing.id);
  server.connections.set('visitor', conn);

  server.applyCollapseTimeoutPenalty(collapsing, visitor);
  assert.equal(conn.dungeonId, home.id);
  assert.equal(conn.player.homeDungeonId, home.id);
  assert.equal(conn.player.lives, 1, 'collapse timeout deducts one life');
  assert.equal(home.players.some((p) => p.id === 'visitor'), true, 'survivor respawns in home dungeon');
  assert.equal(collapsing.players.every((p) => p.id !== 'visitor'), true, 'visitor is removed from collapsing dungeon');
}

function testCollapseDefaultsToSixtySeconds() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const owner = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  owner.status = 'out';
  dungeon.addPlayer(owner);
  const before = Date.now();
  dungeon._checkLifecycle();
  const remainingMs = dungeon.collapseUntil - before;
  assert.equal(dungeon.lifecycleState, STATE.COLLAPSING);
  assert.ok(remainingMs >= 59000 && remainingMs <= 61000, `expected ~60000ms collapse countdown, got ${remainingMs}`);
}

function testOwnerFinalDeathTriggersCollapseDuringScan() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const owner = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  owner.status = 'dead';
  owner.lives = 1;
  owner.frameCounters.dead = Math.round(dungeon.scanFPS * 2) + 1;
  const bot = new ServerPlayer(1, dungeon, 'bot-1', dungeon.id);
  bot.isBot = true;
  bot.status = 'alive';
  dungeon.addPlayer(owner);
  dungeon.addPlayer(bot);

  owner.scanRoutine({});
  assert.equal(owner.status, 'out', 'fatal death eliminates the owner');
  assert.equal(dungeon.lifecycleState, STATE.COLLAPSING, 'owner final death immediately collapses home dungeon');
  assert.ok(dungeon.collapseUntil > Date.now(), 'collapse has an active countdown');
}

function testForeignFinalDeathCollapsesHomeAndClearsAwaySlot() {
  const server = makeServer();
  const home = addDungeon(server);
  const away = addDungeon(server);
  const visitor = new ServerPlayer(1, away, 'visitor', home.id);
  visitor.homeSlot = 0;
  visitor.status = 'dead';
  visitor.lives = 1;
  visitor.frameCounters.dead = Math.round(away.scanFPS * 2) + 1;
  away.addPlayer(visitor);
  const conn = makeConn(visitor, away.id);
  server.connections.set('visitor', conn);

  visitor.scanRoutine({});
  assert.equal(visitor.status, 'out', 'visitor is eliminated on final death abroad');
  assert.equal(home.lifecycleState, STATE.COLLAPSING, 'visitor home dungeon collapses after final death abroad');
  assert.equal(conn.dungeonId, home.id, 'eliminated visitor connection follows home collapse state');
  assert.equal(away.players.every((p) => p.id !== 'visitor'), true, 'foreign dungeon slot is cleared after final death');
}

function testSharedHomeDoesNotCollapseUntilAllRealPlayersOut() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const playerA = new ServerPlayer(0, dungeon, 'a', dungeon.id);
  const playerB = new ServerPlayer(1, dungeon, 'b', dungeon.id);
  playerA.status = 'dead';
  playerA.lives = 1;
  playerA.frameCounters.dead = Math.round(dungeon.scanFPS * 2) + 1;
  playerB.status = 'alive';
  dungeon.addPlayer(playerA);
  dungeon.addPlayer(playerB);

  playerA.scanRoutine({});
  assert.equal(playerA.status, 'out');
  assert.equal(dungeon.lifecycleState, STATE.ACTIVE, 'shared-home dungeon remains active while another real player is alive');

  playerB.status = 'out';
  dungeon._checkLifecycle();
  assert.equal(dungeon.lifecycleState, STATE.COLLAPSING, 'shared-home dungeon collapses after all real players are out');
}

function testCollapseTimeoutFinalDeathCollapsesVisitorHome() {
  const server = makeServer();
  const collapsing = addDungeon(server);
  const home = addDungeon(server);
  const visitor = new ServerPlayer(1, collapsing, 'visitor', home.id);
  visitor.homeSlot = 0;
  visitor.status = 'alive';
  visitor.lives = 1;
  collapsing.addPlayer(visitor);
  const conn = makeConn(visitor, collapsing.id);
  server.connections.set('visitor', conn);

  server.applyCollapseTimeoutPenalty(collapsing, visitor);
  assert.equal(visitor.lives, 0, 'fatal collapse timeout consumes final life');
  assert.equal(visitor.status, 'out');
  assert.equal(home.lifecycleState, STATE.COLLAPSING, 'fatal timeout collapses the visitor home dungeon');
  assert.equal(conn.dungeonId, home.id, 'connection moves to home collapse state after fatal timeout');
  assert.equal(collapsing.players.every((p) => p.id !== 'visitor'), true, 'visitor is removed from the timed-out dungeon');
}

function testCollapseStateVisibleInSnapshot() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const owner = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  owner.status = 'out';
  dungeon.addPlayer(owner);
  dungeon._checkLifecycle();

  const snapshot = dungeon.serialize();
  assert.equal(snapshot.lifecycleState, STATE.COLLAPSING);
  assert.equal(snapshot.collapseCountdownMs, 60000);
  assert.ok(snapshot.collapseUntil > Date.now(), 'snapshot includes collapse end time');
  assert.ok(snapshot.collapseRemainingSeconds >= 59 && snapshot.collapseRemainingSeconds <= 60, 'snapshot includes client-displayable remaining seconds');
}

function testSnapshotIncludesSpecModelFields() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const target = addDungeon(server);
  const player = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  player.status = 'alive';
  dungeon.addPlayer(player);
  dungeon.leftTunnelTarget = { dungeonId: target.id, entrySide: 'right' };
  const monster = new ServerMonster('burwor', null, dungeon);
  dungeon.monsters.push(monster);
  player.bullet = new ServerBullet(player, player.x, player.y, 'right', dungeon);

  const snapshot = dungeon.serialize();
  assert.equal(snapshot.ownerPlayerId, 'owner');
  assert.equal(snapshot.state, STATE.ACTIVE);
  assert.equal(snapshot.playersInside, 1);
  assert.equal(snapshot.leftTunnelState.directionMode, 'CONNECTED_TWO_WAY');
  assert.equal(snapshot.rightTunnelState.directionMode, 'SAME_DUNGEON_ONLY');
  assert.equal(snapshot.players[0].currentDungeonId, dungeon.id);
  assert.equal(snapshot.players[0].aliveState, 'alive');
  assert.equal(snapshot.monsters[0].dungeonId, dungeon.id);
  assert.ok(snapshot.monsters[0].id.startsWith('monster-'));
  assert.equal(snapshot.monsters[0].alive, true);
  assert.equal(snapshot.bullets[0].ownerPlayerId, 'owner');
  assert.equal(snapshot.bullets[0].dungeonId, dungeon.id);
  assert.equal(snapshot.bullets[0].active, true);
}

function testDestroyedDungeonWaitsForPlayerAndMonsterCleanup() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const player = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  player.status = 'out';
  dungeon.addPlayer(player);
  const monster = new ServerMonster('burwor', null, dungeon);
  monster.status = 'alive';
  dungeon.monsters.push(monster);
  dungeon.lifecycleState = STATE.EMPTY;

  dungeon.tick({});
  assert.equal(server.dungeons.has(dungeon.id), true, 'empty dungeon with a player slot is not destroyed yet');
  assert.equal(dungeon.lifecycleState, STATE.EMPTY);

  dungeon.removePlayer(player);
  dungeon.tick({});
  assert.equal(server.dungeons.has(dungeon.id), true, 'empty dungeon with live monsters is not destroyed yet');

  monster.status = 'died';
  dungeon.tick({});
  assert.equal(server.dungeons.has(dungeon.id), false, 'dungeon is destroyed after player and monster cleanup');
}

function testCollapseTimeoutResolvesBotAndOwnerSlotsBeforeDestruction() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  dungeon.lifecycleState = STATE.COLLAPSING;
  dungeon.collapseUntil = Date.now() - 1;
  const owner = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  owner.status = 'out';
  dungeon.addPlayer(owner);
  const bot = server.spawnBot(dungeon.id, 1);
  assert.ok(bot);

  dungeon.tick({});
  assert.equal(dungeon.players.every((p) => p.id === null), true, 'timeout resolves every remaining player slot');
  assert.equal(server.bots.has(bot.id), false, 'timeout removes filler bot from registry');
  assert.equal(server.dungeons.has(dungeon.id), false, 'resolved empty dungeon is destroyed');
}

function testBotPartnerDoesNotBlockOwnerCollapse() {
  const server = makeServer();
  const dungeon = addDungeon(server);
  const owner = new ServerPlayer(0, dungeon, 'owner', dungeon.id);
  owner.status = 'out';
  const bot = new ServerPlayer(1, dungeon, 'bot-1', dungeon.id);
  bot.isBot = true;
  bot.status = 'alive';
  dungeon.addPlayer(owner);
  dungeon.addPlayer(bot);

  dungeon._checkLifecycle();
  assert.equal(dungeon.lifecycleState, STATE.COLLAPSING, 'bot teammate must not prevent owner final-death collapse');
}

function testDestroyedDungeonClearsStaleTunnelTargets() {
  const server = makeServer();
  const a = addDungeon(server);
  const b = addDungeon(server);
  a.leftTunnelTarget = { dungeonId: b.id, entrySide: 'right' };
  a.rightTunnelTarget = { dungeonId: b.id, entrySide: 'left' };

  server.onDungeonDestroyed(b.id);
  assert.equal(a.leftTunnelTarget, null);
  assert.equal(a.rightTunnelTarget, null);
}

const tests = [
  testEndlessPlayersGetSeparateConnectedHomes,
  testTransferPreservesHomeDungeon,
  testCollapseBlocksEntryButAllowsExit,
  testTransferEvictsBotInsteadOfEndingMatch,
  testMonstersRemainInSourceDungeonOnPlayerTravel,
  testPlayerBulletPvPDeductsLifeServerSide,
  testForeignDeathRespawnsHomeAndClearsAwaySlot,
  testClearedDungeonContinuesToNextDungeon,
  testCollapseTimeoutPenaltyRespawnsHome,
  testCollapseDefaultsToSixtySeconds,
  testOwnerFinalDeathTriggersCollapseDuringScan,
  testForeignFinalDeathCollapsesHomeAndClearsAwaySlot,
  testSharedHomeDoesNotCollapseUntilAllRealPlayersOut,
  testCollapseTimeoutFinalDeathCollapsesVisitorHome,
  testCollapseStateVisibleInSnapshot,
  testSnapshotIncludesSpecModelFields,
  testBotPartnerDoesNotBlockOwnerCollapse,
  testDestroyedDungeonWaitsForPlayerAndMonsterCleanup,
  testCollapseTimeoutResolvesBotAndOwnerSlotsBeforeDestruction,
  testDestroyedDungeonClearsStaleTunnelTargets,
];

for (const test of tests) test();
console.log('PASS: BR spec regression checks passed.');
