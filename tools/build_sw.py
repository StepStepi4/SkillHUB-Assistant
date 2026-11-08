#!/usr/bin/env python3
"""Оновлює sw.js: список файлів для офлайн-кешу і версію (хеш вмісту).
Запуск перед кожним релізом:  python3 tools/build_sw.py
"""
import hashlib, os, re, sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE_DIRS = ['css', 'js', 'assets']
INCLUDE_FILES = ['index.html', 'Start.html', 'Format.html', 'Objections.html', 'Education.html', 'manifest.json']
SKIP_PARTS = ('assets/icons/archive/',)          # невикористовувані файли в офлайн-кеш не потрапляють
SKIP_NAMES = ('.DS_Store', 'Thumbs.db')

files = ['./'] + ['./' + f for f in INCLUDE_FILES]
for d in INCLUDE_DIRS:
    for base, _, names in os.walk(os.path.join(ROOT, d)):
        for n in sorted(names):
            rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')
            if n in SKIP_NAMES or any(rel.startswith(p) for p in SKIP_PARTS):
                continue
            files.append('./' + rel)
files = [files[0]] + sorted(set(files[1:]))

h = hashlib.sha256()
for f in files[1:]:
    with open(os.path.join(ROOT, f[2:]), 'rb') as fh:
        h.update(f.encode()); h.update(fh.read())
version = 'v-' + h.hexdigest()[:10]

sw_path = os.path.join(ROOT, 'sw.js')
sw = open(sw_path, encoding='utf-8').read()
shell = 'const SHELL = [\n' + ',\n'.join('  "%s"' % quote(f, safe="/.-_~") for f in files) + '\n];'
sw = re.sub(r'const SHELL = \[.*?\n\];', lambda m: shell, sw, flags=re.S)
sw = re.sub(r"const VERSION = '[^']*';", "const VERSION = '%s';" % version, sw)
open(sw_path, 'w', encoding='utf-8').write(sw)
print('sw.js оновлено: %d файлів, версія %s' % (len(files), version))
