"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const FONT_DIR = path.join(ROOT, "public", "fonts");
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=Rubik:wght@700&display=swap";

function fetchBuf(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: headers || {} }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuf(res.headers.location, headers).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(url + " -> " + res.statusCode));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

async function downloadFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const css = (await fetchBuf(CSS_URL, {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
  })).toString("utf8");
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]))];
  let local = css;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = (url.split(".").pop() || "woff2").split("?")[0];
    const name = "f" + i + "." + ext;
    const dest = path.join(FONT_DIR, name);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, await fetchBuf(url));
    local = local.split(url).join("./" + name);
  }
  fs.writeFileSync(path.join(FONT_DIR, "fonts.css"), local);
  console.log("fonts listas en public/fonts");
}

async function main() {
  await downloadFonts();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
