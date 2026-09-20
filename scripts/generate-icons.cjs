"use strict";

const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const ROOT = path.join(__dirname, "..");
const RES = path.join(ROOT, "resources");
const STORE = path.join(ROOT, "store-assets");
const ICON_SVG = fs.readFileSync(path.join(ROOT, "public", "favicon.svg"), "utf8");

function pngFromSvg(svg, width) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(path.relative(ROOT, file));
}

function logoInner() {
  return ICON_SVG.replace(/<svg[^>]*>/, "").replace("</svg>", "");
}

function iconAt(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${logoInner()}</svg>`;
  return pngFromSvg(svg, size);
}

function logoInset(size, fraction) {
  const logo = Math.round(size * fraction);
  const x = (size - logo) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <svg x="${x}" y="${x}" width="${logo}" height="${logo}" viewBox="0 0 1024 1024">${logoInner()}</svg>
  </svg>`;
  return new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)"
  }).render().asPng();
}

function splash(w, h) {
  const size = Math.round(Math.min(w, h) * 0.36);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#0e1a12"/>
    <g transform="translate(${(w - size) / 2} ${(h - size) / 2}) scale(${size / 1024})">
      ${logoInner()}
    </g>
  </svg>`;
  return pngFromSvg(svg, w);
}

function featureGraphic() {
  const w = 1024, h = 500;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#0e1a12"/>
    <circle cx="210" cy="250" r="150" fill="none" stroke="#e0c36a" stroke-width="10"/>
    <rect x="120" y="200" width="180" height="100" rx="18" fill="#3a2416"/>
    <rect x="132" y="212" width="48" height="76" rx="10" fill="#efe0c4"/>
    <rect x="186" y="212" width="48" height="76" rx="10" fill="#efe0c4"/>
    <rect x="240" y="212" width="48" height="76" rx="10" fill="#efe0c4"/>
    <text x="420" y="230" fill="#f6efe2" font-family="sans-serif" font-size="64" font-weight="700">Three Trick</text>
    <text x="422" y="290" fill="#e0c36a" font-family="sans-serif" font-size="28">El puzzle fisico, ahora en tu movil</text>
  </svg>`;
  return pngFromSvg(svg, w);
}

function main() {
  write(path.join(RES, "icon.png"), iconAt(1024));
  write(path.join(RES, "icon-foreground.png"), logoInset(1024, 0.62));
  write(path.join(RES, "splash.png"), splash(1242, 2436));
  write(path.join(STORE, "icon-512.png"), iconAt(512));
  write(path.join(STORE, "icon-foreground-preview.png"), logoInset(512, 0.62));
  write(path.join(STORE, "feature-graphic.png"), featureGraphic());
}

main();
