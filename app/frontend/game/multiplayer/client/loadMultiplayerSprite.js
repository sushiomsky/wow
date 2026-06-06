import { m } from '../../shared/constants.js';

const SPRITE_URL = '/images/v3.0/sprite.png';
const SPRITE_W = 248;
const SPRITE_H = 355;

export async function loadMultiplayerSprite() {
    return new Promise((resolve) => {
        const image = new Image();
        image.src = SPRITE_URL;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = SPRITE_W;
            canvas.height = SPRITE_H;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            // Recolour sprite sheet to the active palette.
            // Each non-transparent pixel's red channel stores a C64 colour index.
            const orig = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H);
            const out = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H);
            for (let px = 0; px < orig.data.length; px += 4) {
                if (orig.data[px + 3] === 0) {
                    out.data[px + 3] = 0;
                    continue;
                }
                const hex = m.colors.default[orig.data[px]];
                out.data[px] = parseInt(hex[0] + hex[1], 16);
                out.data[px + 1] = parseInt(hex[2] + hex[3], 16);
                out.data[px + 2] = parseInt(hex[4] + hex[5], 16);
                out.data[px + 3] = 255;
            }
            ctx.putImageData(out, 0, 0);
            resolve(canvas);
        };
        image.onerror = () => resolve(null);
    });
}
