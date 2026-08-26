"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "dist-web");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VER = PKG.version || "1.0.0";

function run(cmd, args, cwd) {
  console.log(cmd + " " + args.join(" "));
  const r = spawnSync(cmd, args, {
    cwd: cwd || ROOT,
    stdio: "inherit",
    shell: true
  });
  if (r.status) process.exit(r.status);
}

run("node", ["scripts/prepare-www.cjs"]);
run("npx", ["vite", "build", "--base", "/"]);

fs.writeFileSync(path.join(DIST, "_redirects"), "/*    /index.html   200\n");

const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
if (!html.includes("/assets/")) {
  console.error("El build web no tiene rutas absolutas /assets/. Abortando zip.");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const zip = path.join(OUT, `ThreeTrick-${VER}-netlify.zip`);
if (fs.existsSync(zip)) fs.unlinkSync(zip);

const tar = spawnSync("tar", ["-a", "-cf", zip, "-C", DIST, "."], {
  cwd: ROOT,
  stdio: "inherit",
  windowsHide: true
});
if (tar.status) process.exit(tar.status || 1);

const listing = spawnSync("tar", ["-tf", zip], { encoding: "utf8", windowsHide: true });
const names = (listing.stdout || "").split(/\r?\n/).filter(Boolean);
if (!names.some((n) => /(^|\/)index\.html$/.test(n.replace(/^\.\//, "")))) {
  console.error("El zip no contiene index.html en la raíz. Netlify saldría en blanco.");
  process.exit(1);
}
console.log("-> " + zip);
console.log("Listo en " + OUT + " (v" + VER + ")");
