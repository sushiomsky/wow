import { m } from './constants.js';

export const q = (id) => document.querySelector("#" + id);

export const x = (selector, fn) => Array.prototype.slice.call(document.querySelectorAll(selector)).map(fn);

export const F = (id) => q(id).classList.remove("hide");

export const w = (max) => Math.floor(Math.random() * max) + 1;

export const y = (a, c, f, d, g, h, k, n) => {
    return a + f < g || a > g + k || c + d < h || c > h + n ? false : true;
};

export const u = (b, seconds) => Math.round(b.scanFPS * seconds);

export const H = (val, len) => {
    let str = val.toString();
    if (0 >= len - str.length) return str.split("").slice(0, len).join("");
    do str = " " + str; while (len > str.length);
    return str;
};

// Drawing utilities (require b context)
export const t = (b, a, c, f, d, g) => {
    if (g !== false) {
        if (b.lastColor !== g) {
            b.lastColor = g;
            b.canvas.fillStyle = "#" + m.colors[b.options.palette][g];
        }
    }
    b.canvas.fillRect(a * b.scale, c * b.scale, f * b.scale, d * b.scale);
};

export const l = (b, a, c, f, d, g, h) => {
    b.canvas.drawImage(b.sprite, a, c, f, d, g * b.scale, h * b.scale, f * b.scale, d * b.scale);
};

export const E = (b, color) => t(b, 0, 0, 320, 200, color === undefined ? 0 : color);

export const v = (b, text, c, f, d, fontType, bgColor) => {
    text = "" + text;
    b.canvas.font = fontType === "c64" ? "25px C64ProRegular" : "46px WizardOfWor";
    if (bgColor !== undefined) {
        for (let i = 0; i < text.length; i++) {
            let char = text[i];
            if (char !== " ") {
                t(b, c + 8 * i, f, 8, 8, bgColor); // Simplified drawing for background
                // Original was: b.canvas.fillRect(c * b.scale + 8 * h * b.scale - 3, f * b.scale, 25, -(8 * b.scale))
                // I'll stick closer to original if possible but using t()
            }
        }
    }

    // Closer to original for text rendering
    if (b.lastColor !== d) {
        b.lastColor = d;
        b.canvas.fillStyle = "#" + m.colors[b.options.palette][d];
    }

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char !== " ") {
            b.canvas.fillText(char, c * b.scale + 8 * i * b.scale + (char === "I" && fontType === "c64" ? b.scale : 0), f * b.scale);
        }
    }
};

export const r = (b, name, loop) => {
    b.audio.request({ name, loop: loop === undefined ? false : loop });
};

export const z = (color) => {
    const border = q("border");
    if (border) border.style.borderColor = "#" + m.colors.default[color];
};

export const C = (b, a) => {
    b.canvas.fillStyle = "#" + m.colors[b.options.palette][a];
};
