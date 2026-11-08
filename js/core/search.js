/* Єдиний «поблажливий» пошук для всього застосунку.
   Ігнорує: регістр, апострофи будь-якого вигляду, дефіси й розділові знаки, подвійні пробіли,
   діакритику (é, ü, ё, ї, й …), різницю між схожими латинськими й кириличними літерами (a/а, o/о, i/і …),
   порядок слів («підписка smart» = «Smart підписка»). Якщо нічого не знайдено — пробує розкладку клавіатури
   (набрано англійською замість укр/рос і навпаки). */
(function () {
    const EXTRA = { 'ґ': 'г', 'є': 'е', 'ё': 'е', 'ъ': '', 'ь': '', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ı': 'i', 'þ': 'th' };
    // кириличні літери, що виглядають як латинські → латинські (для обох боків порівняння)
    const LOOK = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'в': 'b' };
    const APOS = /[‘’ʼʹʻ′`´'"«»“”„]/g;

    function norm(s) {
        if (s === null || s === undefined) return '';
        let t = String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
        t = t.replace(APOS, '');
        t = t.replace(/./g, ch => EXTRA[ch] !== undefined ? EXTRA[ch] : ch);
        t = t.replace(/[^\p{L}\p{N}]+/gu, ' ');
        t = t.replace(/./g, ch => LOOK[ch] || ch);
        return t.replace(/\s+/g, ' ').trim();
    }

    const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
    const UA = "йцукенгшщзхїфівапролджєячсмитьбюґ";
    const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
    function swapLayouts(q) {
        const out = [];
        const map = (from, to) => String(q).toLowerCase().replace(/./g, ch => { const i = from.indexOf(ch); return i >= 0 ? to[i] : ch; });
        if (/[a-z\[\];',.`]/i.test(q)) { out.push(map(EN, UA)); out.push(map(EN, RU)); }
        if (/[Ѐ-ӿ]/.test(q)) { out.push(map(UA, EN)); out.push(map(RU, EN)); }
        return out;
    }

    function tokens(q) { return norm(q).split(' ').filter(Boolean); }
    function matchNormed(hayN, toks) { return toks.length > 0 && toks.every(t => hayN.indexOf(t) !== -1); }
    // чи підходить текст під запит (усі слова запиту є в тексті, у будь-якому порядку)
    function match(hay, q) {
        const toks = tokens(q); if (!toks.length) return true;
        return matchNormed(norm(hay), toks);
    }
    // відфільтрувати список; getText(item) повертає текст (або масив текстів) для пошуку
    function filter(list, q, getText) {
        const get = getText || (x => x);
        const prep = list.map(it => { const v = get(it); return { it, n: norm(Array.isArray(v) ? v.join(' ') : v) }; });
        const run = qq => { const toks = tokens(qq); return toks.length ? prep.filter(p => matchNormed(p.n, toks)).map(p => p.it) : null; };
        let res = run(q);
        if (res === null) return list.slice();
        if (res.length) return res;
        const seen = new Set();
        for (const alt of swapLayouts(q)) {
            if (!alt || seen.has(alt)) continue; seen.add(alt);
            const r = run(alt); if (r && r.length) return r;
        }
        return [];
    }
    window.SearchUtil = { norm, match, filter, tokens };
})();
