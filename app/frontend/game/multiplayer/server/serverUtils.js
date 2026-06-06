'use strict';

/** Returns a random integer in the range [1, max] (inclusive). */
const randInt = (max) => Math.floor(Math.random() * max) + 1;

/**
 * AABB (axis-aligned bounding box) overlap test.
 * Returns true when rectangle A (ax, ay, aw, ah) intersects rectangle B (bx, by, bw, bh).
 */
const overlaps = (ax, ay, aw, ah, bx, by, bw, bh) =>
    !(ax + aw < bx || ax > bx + bw || ay + ah < by || ay > by + bh);

/** Converts a duration in seconds to a frame count at the given scan rate. */
const frames = (scanFPS, seconds) => Math.round(scanFPS * seconds);

// Backward-compatible aliases so existing callers continue to work
const w = randInt;
const y = overlaps;
const u = frames;

module.exports = { randInt, overlaps, frames, w, y, u };
