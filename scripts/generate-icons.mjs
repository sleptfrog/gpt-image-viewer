import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const iconDir = join(projectRoot, "public", "icons");
const outputSizes = [16, 32, 48, 128];
const sampleScale = 4;

function mix(start, end, t) {
  return Math.round(start + (end - start) * t);
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function blend(pixel, color) {
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  pixel[0] = Math.round(color[0] * alpha + pixel[0] * inverse);
  pixel[1] = Math.round(color[1] * alpha + pixel[1] * inverse);
  pixel[2] = Math.round(color[2] * alpha + pixel[2] * inverse);
  pixel[3] = Math.round(color[3] + pixel[3] * inverse);
}

function pointInRoundedRect(x, y, rect) {
  const { left, top, width, height, radius } = rect;
  const right = left + width;
  const bottom = top + height;
  if (x < left || x > right || y < top || y > bottom) return false;
  const innerLeft = left + radius;
  const innerRight = right - radius;
  const innerTop = top + radius;
  const innerBottom = bottom - radius;
  if ((x >= innerLeft && x <= innerRight) || (y >= innerTop && y <= innerBottom)) return true;
  const cornerX = x < innerLeft ? innerLeft : innerRight;
  const cornerY = y < innerTop ? innerTop : innerBottom;
  return (x - cornerX) ** 2 + (y - cornerY) ** 2 <= radius ** 2;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function draw(size) {
  const canvasSize = size * sampleScale;
  const pixels = new Uint8ClampedArray(canvasSize * canvasSize * 4);
  const shapes = [
    {
      type: "roundedRect",
      rect: { left: 16, top: 16, width: 96, height: 96, radius: 24 },
      colorAt: (x, y) => {
        const t = Math.max(0, Math.min(1, (x + y - 40) / 176));
        return [mix(37, 8, t), mix(99, 145, t), mix(235, 178, t), 255];
      }
    },
    { type: "roundedRect", rect: { left: 31, top: 29, width: 66, height: 58, radius: 9 }, color: "#f8fafc" },
    { type: "roundedRect", rect: { left: 39, top: 37, width: 50, height: 31, radius: 5 }, color: "#dff7ff" },
    { type: "circle", cx: 78, cy: 47, r: 6, color: "#facc15" },
    { type: "polygon", points: [[42, 67], [57, 51], [67, 62], [74, 55], [86, 67]], color: "#2563eb" },
    { type: "polygon", points: [[39, 67], [54, 49], [67, 67]], color: "#14b8a6" },
    { type: "roundedRect", rect: { left: 41, top: 76, width: 32, height: 4, radius: 2 }, color: "#64748b" },
    { type: "roundedRect", rect: { left: 41, top: 83, width: 22, height: 4, radius: 2 }, color: "#94a3b8" },
    { type: "circle", cx: 86, cy: 84, r: 18, color: [15, 23, 42, 46] },
    { type: "ring", cx: 82, cy: 80, r: 13, stroke: 7, color: "#ffffff" },
    { type: "line", x1: 91, y1: 89, x2: 104, y2: 102, stroke: 7, color: "#ffffff" }
  ];

  for (let y = 0; y < canvasSize; y += 1) {
    for (let x = 0; x < canvasSize; x += 1) {
      const ux = (x + 0.5) / canvasSize * 128;
      const uy = (y + 0.5) / canvasSize * 128;
      const pixel = [0, 0, 0, 0];

      for (const shape of shapes) {
        let hit = false;
        if (shape.type === "roundedRect") hit = pointInRoundedRect(ux, uy, shape.rect);
        if (shape.type === "circle") hit = (ux - shape.cx) ** 2 + (uy - shape.cy) ** 2 <= shape.r ** 2;
        if (shape.type === "polygon") hit = pointInPolygon(ux, uy, shape.points);
        if (shape.type === "ring") {
          const distance = Math.hypot(ux - shape.cx, uy - shape.cy);
          hit = Math.abs(distance - shape.r) <= shape.stroke / 2;
        }
        if (shape.type === "line") hit = distanceToSegment(ux, uy, shape.x1, shape.y1, shape.x2, shape.y2) <= shape.stroke / 2;
        if (!hit) continue;

        const color = shape.colorAt ? shape.colorAt(ux, uy) : Array.isArray(shape.color) ? shape.color : hexToRgb(shape.color);
        blend(pixel, color);
      }

      const offset = (y * canvasSize + x) * 4;
      pixels[offset] = pixel[0];
      pixels[offset + 1] = pixel[1];
      pixels[offset + 2] = pixel[2];
      pixels[offset + 3] = pixel[3];
    }
  }

  const finalPixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < sampleScale; sy += 1) {
        for (let sx = 0; sx < sampleScale; sx += 1) {
          const source = ((y * sampleScale + sy) * canvasSize + x * sampleScale + sx) * 4;
          totals[0] += pixels[source];
          totals[1] += pixels[source + 1];
          totals[2] += pixels[source + 2];
          totals[3] += pixels[source + 3];
        }
      }
      const target = (y * size + x) * 4;
      const samples = sampleScale * sampleScale;
      finalPixels[target] = Math.round(totals[0] / samples);
      finalPixels[target + 1] = Math.round(totals[1] / samples);
      finalPixels[target + 2] = Math.round(totals[2] / samples);
      finalPixels[target + 3] = Math.round(totals[3] / samples);
    }
  }

  return finalPixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function createPng(size, rgba) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    rgba.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND")
  ]);
}

await mkdir(iconDir, { recursive: true });
for (const size of outputSizes) {
  await writeFile(join(iconDir, `icon${size}.png`), createPng(size, Buffer.from(draw(size))));
}

console.log(`Generated ${outputSizes.map((size) => `icon${size}.png`).join(", ")}`);
