const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles", "main.css");
const jsPath = path.join(root, "js", "app.js");
const libraryPath = path.join(root, "js", "library.js");
const onboardingPath = path.join(root, "js", "onboarding.js");
const samplesPath = path.join(root, "data", "sample-songs.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("index.html loads extracted stylesheet and scripts", () => {
  const html = read(indexPath);

  assert.match(html, /<link rel="stylesheet" href="styles\/main\.css">/);
  assert.match(html, /<script src="data\/sample-songs\.js"><\/script>/);
  assert.match(html, /<script src="js\/library\.js"><\/script>/);
  assert.match(html, /<script src="js\/onboarding\.js"><\/script>/);
  assert.match(html, /<script src="js\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<style>/);
});

test("index.html uses the OpenFret brand", () => {
  const html = read(indexPath);
  assert.match(html, /<title>OpenFret<\/title>/);
  // Brand surfaces as either the OPENFRET wordmark image or the text aria-label
  assert.match(html, /OpenFret|OPENFRET/);
  assert.doesNotMatch(html, /Werbach/i);
});

test("index.html ships PWA + Open Graph wiring", () => {
  const html = read(indexPath);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /og:image/);
  // Service worker is registered from JS, not directly in HTML
  const onboarding = read(onboardingPath);
  assert.match(onboarding, /serviceWorker/, "service worker must be registered");
});

test("manifest.json is valid and references the icon", () => {
  const manifest = JSON.parse(read(path.join(root, "manifest.json")));
  assert.equal(manifest.name, "OpenFret");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  manifest.icons.forEach(i => assert.ok(i.src.includes("openfret-icon")));
});

test("starter pack JSON files are valid", () => {
  const songsDir = path.join(root, "songs");
  const files = fs.readdirSync(songsDir).filter(f => f.endsWith(".json"));
  assert.ok(files.length >= 3, `expected at least 3 packs, found ${files.length}`);
  files.forEach(file => {
    const pack = JSON.parse(read(path.join(songsDir, file)));
    assert.ok(pack.name, `${file} must have a name`);
    assert.ok(Array.isArray(pack.songs) && pack.songs.length > 0, `${file} must have songs`);
    pack.songs.forEach(s => {
      assert.ok(s.title, `${file}: every song needs a title`);
      assert.ok(s.license && /public domain/i.test(s.license), `${file}: every song must be PD`);
    });
  });
});

test("stylesheet contains key app sections", () => {
  const css = read(cssPath);

  assert.match(css, /\.header\s*\{/);
  assert.match(css, /\.song-list\s*\{/);
  assert.match(css, /\.tuner-section\s*\{/);
  assert.match(css, /\.metronome-section\s*\{/);
  assert.match(css, /\.welcome-banner\s*\{/);
  assert.match(css, /\.of-modal\s*\{/);
});

test("app script exposes core songbook flow", () => {
  const js = read(jsPath);

  assert.match(js, /function init\(\)/);
  assert.match(js, /function showSongById\(id\)/);
  assert.match(js, /function showTab\(tab\)/);
  assert.match(js, /window\.addEventListener\('DOMContentLoaded', init\);/);
  assert.match(js, /OpenFretLibrary/);
  assert.doesNotMatch(js, /WERBACH_SONGS/);
});

test("library module exposes the public API", () => {
  const js = read(libraryPath);
  assert.match(js, /window\.OpenFretLibrary\s*=/);
  assert.match(js, /getAllSongs/);
  assert.match(js, /addSong/);
  assert.match(js, /updateSong/);
  assert.match(js, /deleteSong/);
  assert.match(js, /exportToFile/);
  assert.match(js, /importFromFile/);
});

test("onboarding module wires the welcome banner", () => {
  const js = read(onboardingPath);
  assert.match(js, /window\.OpenFretOnboarding\s*=/);
  assert.match(js, /showBannerIfNeeded/);
});

test("sample songs catalog ships exactly the curated 10 PD entries", () => {
  const songs = read(samplesPath);
  const titleCount = (songs.match(/title:\s*"/g) || []).length;
  assert.equal(titleCount, 10, `expected 10 sample songs, found ${titleCount}`);
  assert.match(songs, /window\.OPENFRET_SAMPLE_SONGS/);
  assert.match(songs, /Public Domain/i);
  assert.doesNotMatch(songs, /Werbach/i);
});

test("scripts pass JavaScript syntax check", () => {
  [jsPath, libraryPath, onboardingPath, samplesPath].forEach(function (p) {
    const result = spawnSync(process.execPath, ["--check", p], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${p}: ${result.stderr || result.stdout}`);
  });
});
