// Inlines the game (CSS, scripts, icon) into one self-contained HTML file.
// usage: node bundle.js <out.html>
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(__dirname, 'dist', 'CtrlAltSurvive.html');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)" \/>/g, (_, f) => '<style>\n' + read(f) + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => '<script>\n' + read(f).replace(/<\/script/gi, '<\\/script') + '\n</script>');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg')).toString('base64');
html = html.replace('href="icon.svg"', 'href="' + icon + '"');
html = html.replace('<link rel="manifest"', '<link rel="ignore"');
html = html.replace('</title>', '</title>\n  <script>window.CAS_STANDALONE = true;</script>');
if (/src="js\/|href="css\//.test(html)) throw new Error('unbundled reference left in HTML');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('bundled', out, (html.length / 1024).toFixed(0) + ' KB');
