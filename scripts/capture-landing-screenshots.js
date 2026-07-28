#!/usr/bin/env node
/**
 * 실제 앱 CSS/HTML 미리보기를 Electron으로 캡처해 docs/assets/ 에 저장합니다.
 * npm run capture:screenshots
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'docs', 'previews');
const OUT_DIR = path.join(ROOT, 'docs', 'assets');

const SHOTS = [
  { file: 'memo-main.html', out: 'hero.png', width: 380, height: 520 },
  { file: 'sync-settings.html', out: 'feature-sync.png', width: 380, height: 520 },
  { file: 'alarm.html', out: 'feature-alarm.png', width: 380, height: 520 },
];

async function captureOne({ file, out, width, height }) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    transparent: false,
    backgroundColor: '#e8e4dc',
    webPreferences: { sandbox: false },
  });

  await win.loadFile(path.join(PREVIEW_DIR, file));
  await new Promise((r) => setTimeout(r, 400));

  const image = await win.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, out), image.toPNG());
  win.destroy();
  console.log(`✓ ${out}`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const shot of SHOTS) {
    await captureOne(shot);
  }
  app.quit();
});

app.on('window-all-closed', () => app.quit());
