#!/usr/bin/env python3
"""Bundle Glyphwake into one self-contained HTML file (Three.js from jsDelivr).
usage: python3 tools/bundle.py [out.html] [--fragment]
--fragment omits <html>/<head>/<body> (for hosts that add their own skeleton)."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'index.html').read_text()
css = (root / 'css/glyphwake.css').read_text()
three = '<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>'
src = src.replace('<link rel="stylesheet" href="css/glyphwake.css" />', '<style>\n' + css + '\n</style>')
src = src.replace('<script src="../js/vendor/three.min.js"></script>', three)
def inline(m):
    code = (root / m.group(1)).read_text().replace('</script', '<\\/script')
    return '<script>\n' + code + '\n</script>'
src = re.sub(r'<script src="(js/[^"]+)"></script>', inline, src)
if '--fragment' in sys.argv:
    title = re.search(r'<title>.*?</title>', src).group(0)
    head_end = src.index('</head>')
    styles = re.findall(r'<style>.*?</style>', src[:head_end], re.S)
    body = src[src.index('<body>') + 6: src.index('</body>')]
    src = title + '\n<style>:root{color-scheme:dark} html,body{height:100%;background:#05060a}</style>\n' + '\n'.join(styles) + body
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else root / 'dist/glyphwake.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(src)
print(out, len(src) // 1024, 'KB')
