import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { GameServer } = require('../../frontend/game/multiplayer/server/GameServer');
const { DungeonInstance, STATE } = require('../../frontend/game/multiplayer/server/DungeonInstance');
const { ServerPlayer } = require('../../frontend/game/multiplayer/server/ServerPlayer');

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
  testTransferPreservesHomeDungeon,
  testCollapseBlocksEntryButAllowsExit,
  testCollapseTimeoutPenaltyRespawnsHome,
  testCollapseDefaultsToSixtySeconds,
  testBotPartnerDoesNotBlockOwnerCollapse,
  testDestroyedDungeonClearsStaleTunnelTargets,
];

for (const test of tests) test();
console.log('PASS: BR spec regression checks passed.');
