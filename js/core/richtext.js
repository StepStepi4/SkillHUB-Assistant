/* ============================================================
 *  RichText - проста розмітка тексту з Google-таблиці
 *  Повний опис: docs/FORMATTING.md та сторінка Format.html
 *
 *  RichText.render(text, opts)  -> HTML блоку (рядки, заголовки, списки, картки, колонки...)
 *  RichText.inline(text)        -> HTML одного рядка (жирний, колір, посилання...)
 *
 *  opts.plain(line)   - як показувати звичайний рядок (за замовчуванням <div class="rt-p">)
 *  opts.pipeSplit     - символ | всередині рядка = новий рядок (старий формат описів послуг)
 * ============================================================ */
(function (global) {
    'use strict';

    /* ---------------- кольори та стилі ---------------- */
    const COLORS = {
        r: '#ef4444', red: '#ef4444', 'червоний': '#ef4444', 'красный': '#ef4444',
        g: '#10b981', green: '#10b981', 'зелений': '#10b981', 'зеленый': '#10b981',
        b: '#3b82f6', blue: '#3b82f6', 'синій': '#3b82f6', 'синий': '#3b82f6',
        y: '#eab308', yellow: '#eab308', 'жовтий': '#eab308', 'желтый': '#eab308',
        o: '#f97316', orange: '#f97316', 'помаранчевий': '#f97316', 'оранжевый': '#f97316',
        p: '#a855f7', purple: '#a855f7', 'фіолетовий': '#a855f7', 'фиолетовый': '#a855f7',
        s: '#8e8e93', gray: '#8e8e93', grey: '#8e8e93', 'сірий': '#8e8e93', 'серый': '#8e8e93',
        t: '#164f58', teal: '#164f58', 'бірюзовий': '#164f58', 'бирюзовый': '#164f58',
        k: '#111827', black: '#111827', 'чорний': '#111827', 'черный': '#111827',
        w: '#ffffff', white: '#ffffff', 'білий': '#ffffff', 'белый': '#ffffff'
    };
    const FLAGS = {
        bold: 'b', 'ж': 'b', 'жирний': 'b', 'жирный': 'b',
        italic: 'i', 'к': 'i', 'курсив': 'i',
        underline: 'u', 'п': 'u', 'підкр': 'u', 'подчерк': 'u',
        strike: 's', 'з': 's', 'закр': 's', 'зачерк': 's',
        caps: 'caps', 'верх': 'caps',
        mono: 'mono', 'моно': 'mono',
        big: 'big', 'велико': 'big', 'великий': 'big',
        huge: 'huge', 'величезно': 'huge',
        small: 'small', 'мало': 'small', 'малий': 'small'
    };

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function safeUrl(u) {
        u = String(u || '').trim();
        if (/^(https?:|tel:|mailto:|#)/i.test(u)) return u;
        if (/^app:academy$/i.test(u)) return '#academy';
        if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';          // javascript:, data: тощо
        if (/^www\./i.test(u)) return 'https://' + u;
        return u;                                                // відносний шлях
    }

    /* ---------------- очищення HTML ---------------- */
    function sanitize(html) {
        if (typeof document === 'undefined') return html;
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        tpl.content.querySelectorAll('script,iframe,object,embed,link,meta,base,form,style,frame,frameset').forEach(n => n.remove());
        tpl.content.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(a => {
                const n = a.name.toLowerCase(), v = a.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
                if (n.startsWith('on')) el.removeAttribute(a.name);
                else if (['href', 'src', 'xlink:href', 'formaction', 'action', 'srcset'].includes(n) && /^(javascript|vbscript|data:text)/.test(v)) el.removeAttribute(a.name);
            });
            if (el.tagName === 'A' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
        });
        return tpl.innerHTML;
    }

    /* ---------------- рядкові (inline) позначення ---------------- */
    function wrapStyle(spec, open, close) {
        const tokens = spec.split(',').map(x => x.trim()).filter(Boolean);
        if (!tokens.length) return null;
        let color = '', bg = '', size = 0;
        const cls = [];
        for (const tk of tokens) {
            let name = tk.toLowerCase(), pill = false;
            if (name.length > 1 && name.endsWith('!')) { pill = true; name = name.slice(0, -1); }
            if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(name)) { if (pill) bg = name; else color = name; continue; }
            if (/^\d{1,2}$/.test(name) && +name >= 8 && +name <= 64) { size = +name; continue; }
            if (COLORS[name]) { if (pill) bg = COLORS[name]; else color = COLORS[name]; continue; }
            if (FLAGS[name]) { cls.push('rt-' + FLAGS[name]); continue; }
            return null;                                         // невідомий токен - це не розмітка
        }
        let style = '';
        if (size) style += 'font-size:' + size + 'px;';
        if (bg) style += 'background:' + bg + ';color:' + (color || '#fff') + ';';
        else if (color) style += 'color:' + color + ';';
        return open('<span class="' + (bg ? 'rt-pill ' : '') + (size ? 'rt-fs ' : '') + cls.join(' ') + '"' + (style ? ' style="' + style + '"' : '') + '>') + '\u0000' + close('</span>');
    }

    // параметри в лапках після адреси: (url "w=200 h=48 a=c c=g t=w")
    function optStyle(str, kind) {
        const o = {};
        String(str || '').replace(/([a-z]+)=([^\s,]+)/gi, (m, k, v) => { o[k.toLowerCase()] = v; return m; });
        const col = v => COLORS[String(v).toLowerCase()] || (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : '');
        const dim = v => /^\d{1,4}(px|%)?$/.test(v) ? (/[%x]$/.test(v) ? v : v + 'px') : '';
        let st = '', cls = '';
        if (o.w && dim(o.w)) st += 'width:' + dim(o.w) + ';';
        if (o.h && dim(o.h)) st += (kind === 'btn' ? 'min-height:' : 'height:') + dim(o.h) + ';';
        if (kind === 'btn') {
            if (col(o.c)) st += 'background:' + col(o.c) + ';';
            if (col(o.t)) st += 'color:' + col(o.t) + ' !important;';
            if (o.w || o.i) cls += ' rt-btn-inline';
            if (o.a === 'c' || o.a === 'r') cls += ' rt-a-' + o.a;
        } else if (o.a === 'c' || o.a === 'r' || o.a === 'l') cls += ' rt-a-' + o.a;
        return { st, cls };
    }

    function inline(src) {
        let s = String(src == null ? '' : src);
        const hold = [];
        const keep = html => { hold.push(html); return '\u0001' + (hold.length - 1) + '\u0002'; };

        // 1. екранування \*  \_  \/ ...
        s = s.replace(/\\([*_\/~^=+{}\[\]`\\|#>-])/g, (m, c) => keep(esc(c)));
        // 2. готовий HTML (старі описи) - не чіпаємо
        s = s.replace(/<\/?[a-zA-Z][^>]*>/g, m => keep(m));
        // 3. `код` (торкнутися = копіювати)
        s = s.replace(/`([^`\n]+)`/g, (m, c) => keep('<span class="rt-code rt-copy" data-copy="' + esc(c) + '" title="Копіювати">' + esc(c) + '</span>'));
        // 4. картинки ![alt](url)
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, url, opt) => {
            const u = safeUrl(url); if (!u) return m;
            const o = optStyle(opt, 'img');
            return keep('<img class="rt-img' + o.cls + '" loading="lazy" src="' + esc(u) + '" alt="' + esc(alt) + '"' + (o.st ? ' style="' + o.st + '"' : '') + '>');
        });
        // 5. посилання [текст](url), кнопка [>текст](url)
        s = s.replace(/\[(>?)([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, btn, text, url, opt) => {
            const u = safeUrl(url); if (!u) return m;
            const o = btn ? optStyle(opt, 'btn') : { st: '', cls: '' };
            const inner = inline(text);
            const ac = /^#academy$/i.test(u) ? ' data-academy="1"' : '';
            const tgt = /^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : '';
            return keep('<a class="' + (btn ? 'rt-btn' : 'rt-link') + o.cls + '"' + (o.st ? ' style="' + o.st + '"' : '') + ' href="' + esc(u) + '"' + tgt + ac + '>' + inner + '</a>');
        });
        // 6. голі посилання
        s = s.replace(/\bhttps?:\/\/[^\s<>"')]+/g, m => keep('<a class="rt-link" href="' + esc(m) + '" target="_blank" rel="noopener noreferrer">' + esc(m) + '</a>'));

        // 7. {стиль|текст}
        s = s.replace(/\{([^{}|¦\n]{1,40})[|¦]([^{}\n]+?)\}/g, (m, spec, text) => {
            const r = wrapStyle(spec, keep, keep);
            return r ? r.replace('\u0000', () => text) : m;
        });

        // 8. парні позначки (відкриваюча позначка не після літери/цифри, закриваюча не перед літерою/цифрою, без пробілів усередині)
        const rx = x => x.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
        const pair = (mark, openTag, closeTag) => {
            const c = rx(mark[0]), M = rx(mark);
            const re = new RegExp('(?<![\\w' + c + '])' + M + '(?=[^\\s' + c + '])(.+?)(?<=[^\\s' + c + '])' + M + '(?![\\w' + c + '])', 'g');
            s = s.replace(re, (m, t) => keep(openTag) + t + keep(closeTag));
        };
        pair('//', '<span class="rt-caps rt-b">', '</span>');
        pair('/', '<span class="rt-caps">', '</span>');
        pair('**', '<b>', '</b>');
        pair('*', '<b>', '</b>');
        pair('++', '<span class="rt-u">', '</span>');
        pair('==', '<mark class="rt-mark">', '</mark>');
        pair('~', '<span class="rt-s">', '</span>');
        pair('_', '<i>', '</i>');
        pair('^', '<span class="rt-big">', '</span>');

        // 9. повертаємо збережене (вкладені можуть бути багаторівневі)
        for (let i = 0; i < 4 && /\u0001\d+\u0002/.test(s); i++) s = s.replace(/\u0001(\d+)\u0002/g, (m, n) => hold[+n]);
        return sanitize(s);
    }

    /* ---------------- блоки ---------------- */
    const RE = {
        h: /^(#{1,3})\s+(.+)$/,
        hr: /^(-{3,}|={3,}|\.{3,}|\*{3,}|~{3,})$/,
        hrText: /^---+\s*(.+?)\s*---+$/,
        callout: /^([i!x+]?)>\s+(.+)$/,
        bullet: /^[-•]\s+(.+)$/,
        num: /^(\d+)[.)]\s+(.+)$/,
        check: /^\[( |x|X)\]\s+(.+)$/,
        align: /^\[(центр|право|ліво|c|r|l)\]\s*(.*)$/i,
        br: /^\[(?:br|пробіл)(?:\s+(\d{1,3}))?\]$/i,
        cols: /^\[([2-4])\]$/,
        acc: /^\[\+\]\s*(.*)$/
    };
    const isTableRow = l => /^\|.*\|$/.test(l) && l.split('|').length >= 4;

    function render(src, opt) {
        opt = opt || {};
        const plain = opt.plain || (l => '<div class="rt-p">' + inline(l) + '</div>');
        let lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n').map(x => x.trim());
        if (opt.pipeSplit) lines = lines.flatMap(l => isTableRow(l) ? [l] : l.split('|').map(x => x.trim()));
        return blocks(lines, plain);
    }

    // шукає кінець блоку з урахуванням вкладеності
    function findEnd(lines, from, isOpen, isClose) {
        let depth = 1;
        for (let i = from; i < lines.length; i++) {
            if (isOpen(lines[i])) depth++;
            else if (isClose(lines[i]) && --depth === 0) return i;
        }
        return -1;
    }

    function blocks(lines, plain) {
        let out = '', pendW = null;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (!l) continue;
            let m;

            // --- картка [[ Заголовок ... ]]
            if ((m = l.match(/^\[\[\s*(.*)$/)) && !/\]\]\s*$/.test(l)) {
                const end = findEnd(lines, i + 1, x => /^\[\[/.test(x) && !/\]\]\s*$/.test(x), x => x === ']]');
                const stop = end === -1 ? lines.length : end;
                const title = m[1] ? '<div class="rt-card-title">' + inline(m[1]) + '</div>' : '';
                out += '<div class="rt-card">' + title + blocks(lines.slice(i + 1, stop), plain) + '</div>';
                i = stop; continue;
            }
            // --- колонки [2] ... [|] ... [/]
            if ((m = l.match(RE.cols))) {
                const end = findEnd(lines, i + 1, x => RE.cols.test(x), x => x === '[/]');
                const stop = end === -1 ? lines.length : end;
                const inner = lines.slice(i + 1, stop), cols = [[]]; let depth = 0;
                inner.forEach(x => {
                    if (RE.cols.test(x)) depth++;
                    if (x === '[/]') depth--;
                    if (x === '[|]' && depth === 0) cols.push([]); else cols[cols.length - 1].push(x);
                });
                out += '<div class="rt-cols rt-cols-' + m[1] + '">' + cols.map(c => '<div class="rt-col">' + blocks(c, plain) + '</div>').join('') + '</div>';
                i = stop; continue;
            }
            // --- акордеон [+] Заголовок ... [/+]
            if ((m = l.match(RE.acc))) {
                const end = findEnd(lines, i + 1, x => RE.acc.test(x), x => x === '[/+]');
                const stop = end === -1 ? lines.length : end;
                out += '<details class="rt-acc"><summary>' + inline(m[1] || 'Детальніше') + '</summary><div class="rt-acc-body">' + blocks(lines.slice(i + 1, stop), plain) + '</div></details>';
                i = stop; continue;
            }
            // --- ширина стовпців наступної таблиці: [ширина 30 40 30]
            if ((m = l.match(/^\[ширина\s+([\d.\s]+)\]$/i))) { pendW = m[1].trim().split(/\s+/).map(Number).filter(n => n > 0 && n <= 100); continue; }
            // --- таблиця
            if (isTableRow(l)) {
                const rows = []; let j = i;
                while (j < lines.length && isTableRow(lines[j])) { rows.push(lines[j]); j++; }
                const cells = r => {
                    r = r.trim().replace(/^\|/, '').replace(/\|$/, '');
                    const out = []; let cur = '', depth = 0, tick = false;
                    for (let i = 0; i < r.length; i++) {
                        const ch = r[i];
                        if (ch === '\\' && i + 1 < r.length) { cur += ch + r[++i]; continue; }
                        if (ch === '`') tick = !tick;
                        else if (!tick && ch === '{') depth++;
                        else if (!tick && ch === '}' && depth) depth--;
                        if (ch === '|' && !depth && !tick) { out.push(cur.trim()); cur = ''; } else cur += ch;
                    }
                    out.push(cur.trim()); return out;
                };
                const sepIdx = rows.findIndex(r => cells(r).every(c => /^:?-{2,}:?$/.test(c)));
                const colAl = sepIdx >= 0 ? cells(rows[sepIdx]).map(c => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : '') : [];
                const widths = pendW; pendW = null;
                let html = '<div class="rt-table-wrap"><table class="rt-table' + (widths ? ' rt-fixed' : '') + '">';
                rows.forEach((r, idx) => {
                    if (idx === sepIdx) return;
                    const head = sepIdx > 0 && idx < sepIdx;
                    html += '<tr>' + cells(r).map((c, ci) => {
                        const t = head ? 'th' : 'td';
                        let al = colAl[ci] || '';
                        const am = c.match(/^\[(центр|право|ліво|c|r|l)\]\s*([\s\S]*)$/i);
                        if (am) { al = { 'центр': 'center', c: 'center', 'право': 'right', r: 'right', 'ліво': 'left', l: 'left' }[am[1].toLowerCase()]; c = am[2]; }
                        const wst = (widths && idx === 0 && widths[ci]) ? 'width:' + widths[ci] + '%;' : (widths && head && idx === 0 ? '' : '');
                        const stl = (al ? 'text-align:' + al + ';' : '') + wst;
                        return '<' + t + (stl ? ' style="' + stl + '"' : '') + '>' + inline(c) + '</' + t + '>';
                    }).join('') + '</tr>';
                });
                out += html + '</table></div>';
                i = j - 1; continue;
            }
            // --- заголовки
            if ((m = l.match(RE.h))) { out += '<div class="rt-h rt-h' + m[1].length + '">' + inline(m[2]) + '</div>'; continue; }
            // --- розділювачі
            if ((m = l.match(RE.hrText))) { out += '<div class="rt-hr-text"><span>' + inline(m[1]) + '</span></div>'; continue; }
            if (RE.hr.test(l)) {
                const k = l[0];
                out += '<div class="rt-hr ' + (k === '-' ? 'rt-hr-thin' : k === '=' ? 'rt-hr-thick' : k === '.' ? 'rt-hr-dots' : k === '*' ? 'rt-hr-stars' : 'rt-hr-wave') + '"></div>';
                continue;
            }
            // --- пробіл
            if ((m = l.match(RE.br))) { out += '<div style="height:' + (m[1] ? Math.min(+m[1], 200) : 14) + 'px"></div>'; continue; }
            // --- виноски і цитати
            if ((m = l.match(RE.callout))) {
                const kind = { '': 'quote', i: 'info', '!': 'warn', x: 'danger', '+': 'ok' }[m[1]];
                const body = [m[2]];
                while (i + 1 < lines.length && lines[i + 1] && RE.callout.test(lines[i + 1]) && lines[i + 1].match(RE.callout)[1] === m[1]) { i++; body.push(lines[i].match(RE.callout)[2]); }
                out += '<div class="rt-callout rt-' + kind + '">' + body.map(x => { const h = x.match(/^(#{1,3})\s+(.+)$/); return h ? '<div class="rt-h rt-h' + h[1].length + '">' + inline(h[2]) + '</div>' : '<div>' + inline(x) + '</div>'; }).join('') + '</div>';
                continue;
            }
            // --- списки
            if (RE.bullet.test(l) || RE.num.test(l) || RE.check.test(l)) {
                const type = RE.check.test(l) ? 'check' : RE.num.test(l) ? 'num' : 'bullet';
                const items = [];
                let j = i;
                while (j < lines.length) {
                    const t = lines[j], mm = (type === 'check' ? t.match(RE.check) : type === 'num' ? t.match(RE.num) : t.match(RE.bullet));
                    if (!mm) break;
                    items.push(type === 'check' ? { done: /x/i.test(mm[1]), text: mm[2] } : { text: type === 'num' ? mm[2] : mm[1] });
                    j++;
                }
                if (type === 'num') out += '<ol class="rt-list rt-ol" start="' + l.match(RE.num)[1] + '">' + items.map(x => '<li>' + inline(x.text) + '</li>').join('') + '</ol>';
                else if (type === 'check') out += '<ul class="rt-list rt-checks">' + items.map(x => '<li class="' + (x.done ? 'done' : '') + '"><span class="rt-box">' + (x.done ? '✓' : '') + '</span><span>' + inline(x.text) + '</span></li>').join('') + '</ul>';
                else out += '<ul class="rt-list rt-ul">' + items.map(x => '<li>' + inline(x.text) + '</li>').join('') + '</ul>';
                i = j - 1; continue;
            }
            // --- вирівнювання [центр] текст
            if ((m = l.match(RE.align))) {
                const a = { 'центр': 'center', c: 'center', 'право': 'right', r: 'right', 'ліво': 'left', l: 'left' }[m[1].toLowerCase()];
                out += '<div style="text-align:' + a + '">' + blocks([m[2]], plain) + '</div>';
                continue;
            }
            // --- звичайний рядок
            out += plain(l);
        }
        return out;
    }

    /* ---------------- події: копіювання коду, відкриття Академії ---------------- */
    function copyText(text, el) {
        const done = () => { if (el) { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); } };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => { });
        else {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { } ta.remove();
        }
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
            const c = e.target.closest && e.target.closest('.rt-copy');
            if (c) { e.stopPropagation(); copyText(c.getAttribute('data-copy') || c.textContent, c); return; }
            const a = e.target.closest && e.target.closest('a[data-academy]');
            if (a && global.Academy) { e.preventDefault(); global.Academy.open(); }
        });
    }

    global.RichText = { render: render, inline: inline, sanitize: sanitize };
})(typeof window !== 'undefined' ? window : globalThis);
