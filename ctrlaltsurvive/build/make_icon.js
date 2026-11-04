// Renders ../icon.svg to PNGs (16, 32, 48, 256 px) with Playwright, for the .exe icon.
// usage: node make_icon.js <outDir>
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright'); }
const fs = require('fs'), path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icon.svg'), 'utf8');
  const out = process.argv[2];
  const b = await pw.chromium.launch();
  for (const s of [16, 32, 48, 256]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent('<html><body style="margin:0;background:transparent">' + svg.replace('<svg ', '<svg width="' + s + '" height="' + s + '" ') + '</body></html>');
    await p.screenshot({ path: path.join(out, 'icon' + s + '.png'), omitBackground: true });
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
