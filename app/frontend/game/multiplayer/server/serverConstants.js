'use strict';

// Pipe-separated wall strings for each difficulty tier; each entry is one dungeon layout.
const dungeons = {
    easy: "1x3,4x3,8x3,11x3,3x4,9x4,5x5,7x5|1x2,2x2,3x2,4x2,5x2,6x2,7x2,8x2,9x2,10x2,3x3,5x3,6x3,8x3,2x4,9x4,1x5,3x5,5x5,6x5,8x5,10x5,2x6,9x6 2x1,3x1,6x1,9x1,10x1,2x2,4x2,6x2,8x2,10x2,1x3,5x3,7x3,11x3,2x4,10x4,3x5,9x5|4x2,7x2,3x3,8x3,2x4,4x4,7x4,9x4,1x5,3x5,5x5,6x5,8x5,10x5,4x6,7x6 2x1,3x1,9x1,10x1,3x2,4x2,8x2,9x2,1x3,5x3,7x3,11x3,5x4,6x4,7x4,5x5,7x5|4x1,7x1,1x2,5x2,6x2,10x2,2x3,9x3,2x4,3x4,8x4,9x4,1x5,10x5,3x6,8x6 2x1,5x1,7x1,10x1,2x2,10x2,1x3,3x3,9x3,11x3,2x4,4x4,8x4,10x4,2x5,3x5,9x5,10x5|3x1,8x1,3x3,4x3,5x3,6x3,7x3,8x3,2x4,4x4,7x4,9x4,3x5,5x5,6x5,8x5,4x6,7x6 2x1,5x1,7x1,10x1,2x2,3x2,6x2,9x2,10x2,1x3,11x3,2x4,10x4,2x5,5x5,7x5,10x5|3x1,8x1,4x2,7x2,2x4,3x4,4x4,5x4,6x4,7x4,8x4,9x4,4x5,7x5,3x6,8x6 2x1,5x1,7x1,10x1,3x2,5x2,7x2,9x2,1x3,11x3,2x4,10x4,2x5,4x5,8x5,10x5|3x1,8x1,1x2,10x2,2x3,5x3,6x3,9x3,3x4,4x4,5x4,6x4,7x4,8x4,4x5,7x5,5x6,6x6 2x1,5x1,7x1,10x1,3x2,6x2,9x2,1x3,6x3,11x3,2x4,5x4,7x4,10x4,2x5,6x5,10x5|1x2,4x2,7x2,10x2,2x3,9x3,3x4,4x4,7x4,8x4,3x5,8x5,4x6,7x6 2x1,5x1,7x1,10x1,4x2,5x2,7x2,8x2,4x3,8x3,2x4,5x4,7x4,10x4,3x5,9x5|3x1,8x1,1x2,10x2,2x3,5x3,6x3,9x3,2x4,3x4,8x4,9x4,1x5,5x5,6x5,10x5,4x6,7x6 2x1,6x1,10x1,2x2,5x2,7x2,10x2,1x3,6x3,11x3,2x4,3x4,6x4,9x4,10x4,2x5,6x5,10x5|3x1,8x1,3x2,4x2,7x2,8x2,2x3,9x3,3x4,4x4,7x4,8x4,4x6,7x6 4x1,6x1,8x1,3x2,6x2,9x2,1x3,6x3,11x3,5x5,7x5|2x1,9x1,1x2,3x2,8x2,10x2,4x3,7x3,2x4,3x4,4x4,7x4,8x4,9x4,1x5,2x5,5x5,6x5,9x5,10x5,3x6,8x6 4x1,6x1,8x1,4x2,6x2,8x2,1x3,5x3,7x3,11x3,3x4,6x4,9x4,5x5,7x5|2x1,9x1,1x2,10x2,2x3,4x3,7x3,9x3,2x4,4x4,7x4,9x4,1x5,10x5,3x6,8x6 4x1,6x1,8x1,5x2,7x2,1x3,2x3,4x3,8x3,10x3,11x3,3x4,4x4,8x4,9x4,6x5|2x1,9x1,1x2,3x2,8x2,10x2,2x3,3x3,5x3,6x3,8x3,9x3,5x4,6x4,1x5,10x5,2x6,4x6,7x6,9x6".split(" "),
    hard: "2x1,5x1,7x1,10x1,3x2,6x2,9x2,4x3,8x3,5x4,7x4|2x2,9x2,3x3,8x3,4x4,7x4,2x5,5x5,6x5,9x5 2x1,6x1,10x1,3x2,6x2,9x2,4x3,8x3,3x4,6x4,9x4,2x5,6x5,10x5|4x2,7x2,1x3,10x3,1x4,10x4,4x5,7x5 2x1,10x1,3x2,5x2,7x2,9x2,3x4,5x4,7x4,9x4,2x5,10x5|2x2,5x2,6x2,9x2,3x3,4x3,7x3,8x3,3x4,4x4,7x4,8x4,2x5,5x5,6x5,9x5 2x1,10x1,4x2,5x2,7x2,8x2,2x3,10x3,3x4,4x4,8x4,9x4|2x2,5x2,6x2,9x2,2x3,3x3,8x3,9x3,4x4,7x4,2x5,9x5 2x2,4x2,8x2,10x2,2x4,4x4,8x4,10x4|1x2,4x2,7x2,10x2,2x3,5x3,6x3,9x3,3x4,5x4,6x4,8x4,1x5,4x5,7x5,10x5 5x1,7x1,2x2,3x2,9x2,10x2,4x3,5x3,7x3,8x3,2x4,10x4,3x5,4x5,8x5,9x5|2x2,5x2,6x2,9x2,2x3,4x3,7x3,9x3,1x4,4x4,7x4,10x4,2x5,9x5 5x1,7x1,4x2,8x2,3x3,9x3,2x4,5x4,7x4,10x4,4x5,8x5|4x2,7x2,3x3,8x3,2x4,5x4,6x4,9x4,4x5,7x5 |1x2,3x2,4x2,7x2,8x2,10x2,1x3,2x3,4x3,5x3,6x3,7x3,9x3,10x3,2x4,3x4,5x4,6x4,8x4,9x4,3x5,4x5,7x5,8x5".split(" "),
    fix: ["2x1,4x1,5x1,7x1,8x1,10x1,2x2,3x2,9x2,10x2,2x3,10x3,3x4,5x4,6x4,7x4,9x4,6x5|3x2,8x2,2x4,9x4,1x5,10x5,2x6,4x6,7x6,9x6", "|"]
};

// Point values awarded for killing each enemy type.
const scoring = { burwor: 100, garwor: 200, thorwor: 500, worluk: 1000, worrior: 1000, wizardOfWor: 2500 };

// Ordered list of movement directions used by the path-generation system.
const directions = ["up", "right", "down", "left"];

module.exports = { dungeons, scoring, directions };
