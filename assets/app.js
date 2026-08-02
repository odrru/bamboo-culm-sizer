if (typeof window !== 'undefined') {
    console.log('%c bamboo-culm-sizer. v1.1.0 - 2026 by J.Oduru.', 'font:11px Inter,sans-serif;color:#a8a29e;letter-spacing:0.04em');
}
const $ = (id) => document.getElementById(id);
const gv = (id) => parseFloat($(id).value);
const gs = (id) => $(id).value;
let _katexReady = false;
const k = (s) => { if (!_katexReady) return `<span class="kt-pending">${s}</span>`; try { return katex.renderToString(s, { throwOnError: false, output: 'html' }); } catch { return s; } };
const kd = (s) => { if (!_katexReady) return `<span class="kt-pending">${s}</span>`; try { return katex.renderToString(s, { displayMode: true, throwOnError: false, output: 'html' }); } catch { return s; } };

// Public member-design scope. Durability remains exclusive to the Pro app.
const SCOPE_NOTE = [
    '**Scope**: Bamboo Culm Sizer is a member-level structural design tool for bamboo culms. Checks bending, shear, axial, and combined loading to ISO 22156 (2021) and IStructE Manual for the design of bamboo structures to ISO 22156:2021 (2025). Results must be reviewed by a qualified structural engineer.',
];

function renderInlineMath() {
    document.querySelectorAll('.kt[data-k]').forEach(el => { el.innerHTML = k(el.getAttribute('data-k')); });
}

// HTML-escape prose so `<` / `&` / `>` from notes can never inject markup.
const escHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Render a note string that may contain inline math wrapped in $...$.
// Prose segments are HTML-escaped; math segments are typeset by KaTeX.
// Keep prose escaped while allowing inline KaTeX expressions.
const renderNoteHtml = (s) => {
    if (s == null) return '';
    const str = String(s);
    if (!str) return '';
    const parts = str.split(/\$([^$]*)\$/g);
    if (parts.length % 2 === 0) {
        // Unbalanced $ - treat as plain text so we never emit broken markup.
        return escHtml(str).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }
    return parts
        .map((seg, i) => i % 2 === 0
            ? escHtml(seg).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            : k(seg))
        .join('');
};

// ---------- SVG drawing (presentation only - stays client-side) ----------
function drawSection() {
    const D = gv('D'), t = gv('t');
    const di = Math.max(0, D - 2 * t);
    const Wbox = 420, Hbox = 280;
    const padT = 44, padB = 44, padL = 80, padR = 80;
    const availW = Wbox - padL - padR, availH = Hbox - padT - padB;
    const scale = Math.min(availW / D, availH / D);
    const cx = padL + availW / 2;
    const cy = padT + availH / 2;
    const Ro = (D / 2) * scale;
    const Ri = (di / 2) * scale;
    const ring = `M ${cx - Ro} ${cy} A ${Ro} ${Ro} 0 1 0 ${cx + Ro} ${cy} A ${Ro} ${Ro} 0 1 0 ${cx - Ro} ${cy} Z M ${cx - Ri} ${cy} A ${Ri} ${Ri} 0 1 1 ${cx + Ri} ${cy} A ${Ri} ${Ri} 0 1 1 ${cx - Ri} ${cy} Z`;
    $('cpoly').setAttribute('d', ring);
    $('caxes').innerHTML = `
                <line class="axis" x1="${padL - 16}" y1="${cy}" x2="${Wbox - padR + 16}" y2="${cy}"/>
                <line class="axis" x1="${cx}" y1="${padT - 18}" x2="${cx}" y2="${Hbox - padB + 18}"/>
                <circle class="center-dot" cx="${cx}" cy="${cy}" r="1.8"/>`;
    const yD = padT - 22;
    const yDi = Hbox - padB + 26;
    const a = -Math.PI / 4;
    const tx1 = cx + Ri * Math.cos(a), ty1 = cy + Ri * Math.sin(a);
    const tx2 = cx + Ro * Math.cos(a), ty2 = cy + Ro * Math.sin(a);
    const tx3 = tx2 + 22 * Math.cos(a), ty3 = ty2 + 22 * Math.sin(a);
    let dims = `
                <line class="dim-line" x1="${cx - Ro}" y1="${yD}" x2="${cx + Ro}" y2="${yD}" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                <line class="dim-line" x1="${cx - Ro}" y1="${yD + 3}" x2="${cx - Ro}" y2="${cy - Ro}" stroke-dasharray="2 2"/>
                <line class="dim-line" x1="${cx + Ro}" y1="${yD + 3}" x2="${cx + Ro}" y2="${cy - Ro}" stroke-dasharray="2 2"/>
                <text class="dim-text" x="${cx}" y="${yD - 4}" text-anchor="middle"><tspan class="var">D</tspan> = ${D.toFixed(1)}</text>`;
    if (Ri > 6) {
        dims += `
                <line class="dim-line" x1="${cx - Ri}" y1="${yDi}" x2="${cx + Ri}" y2="${yDi}" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
                <line class="dim-line" x1="${cx - Ri}" y1="${yDi - 3}" x2="${cx - Ri}" y2="${cy + Ri}" stroke-dasharray="2 2"/>
                <line class="dim-line" x1="${cx + Ri}" y1="${yDi - 3}" x2="${cx + Ri}" y2="${cy + Ri}" stroke-dasharray="2 2"/>
                <text class="dim-text" x="${cx}" y="${yDi + 12}" text-anchor="middle"><tspan class="var">d</tspan><tspan baseline-shift="sub" font-size="80%">i</tspan> = ${di.toFixed(1)}</text>`;
    }
    dims += `
                <line class="dim-line" x1="${tx1}" y1="${ty1}" x2="${tx3}" y2="${ty3}"/>
                <text class="dim-text" x="${tx3 + 4}" y="${ty3 + 3}" text-anchor="start"><tspan class="var">t</tspan> = ${t.toFixed(1)}</text>`;
    $('dims').innerHTML = dims;
    $('caxis-labels').innerHTML = `
                <text class="axis-label" x="${Wbox - padR + 18}" y="${cy - 4}">y</text>
                <text class="axis-label" x="${cx + 6}" y="${Hbox - padB + 12}">z</text>`;
    $('caption').textContent = `\u00D8 ${D.toFixed(0)} \u00D7 ${t.toFixed(1)} (mm)`;
}

function syncBundleGridOptions() {
    const row = $('bundle-grid-row');
    const select = $('bundle_grid');
    const shape = window.BAMBOO_CALC.shapeFor(
        Number.parseInt(gs('n_culms'), 10),
        gv('D'),
    );
    const options = shape.type === 'rectangular' ? shape.options : [];
    const current = select.value;

    if (options.length <= 1) {
        row.hidden = true;
        select.innerHTML = '';
        return;
    }

    select.innerHTML = options
        .map(option => `<option value="${option.grid}">${option.grid}</option>`)
        .join('');
    select.value = options.some(option => option.grid === current)
        ? current
        : options[0].grid;
    row.hidden = false;
}

// ---------- DOM templating helpers ----------
const refHtml = (r) => {
    const txt = String(r ?? '').trim();
    // Existing line-break rules - applied to prose segments only.
    const withBreaks = (s) => {
        const m = s.match(/^(ISO\s+22156[^\/]*?)\s*\/\s*(IStructE.+)$/);
        if (m) return `${m[1].trim()}<br>${m[2].trim()}`;
        return s.replace(/(IStructE\s+Manual(?:\s*\(\d+\))?)\s+/, '$1<br>');
    };
    const parts = txt.split(/\$([^$]*)\$/g);
    // Unbalanced $ - treat as plain text so we never emit broken markup.
    if (parts.length % 2 === 0) return withBreaks(escHtml(txt));
    return parts
        .map((seg, i) => (i % 2 === 0 ? withBreaks(escHtml(seg)) : k(seg)))
        .join('');
};
const bkRow = (r) => `<tr><td>${r.name}</td><td class="sym">${k(r.sym)}</td><td class="val">${r.val}</td></tr>`;
const bkTable = (id, rows) => { $(id).innerHTML = rows.map(bkRow).join(''); };
const classRow = (c) => `<tr>
            <td><div class="check-name">${c.name}</div></td>
            <td class="sym">${k(c.sym)}</td>
            <td class="check-ratio">${Number(c.val).toFixed(2)}</td>
            <td>${k(c.lim)}</td>
            <td><div class="check-ref">${refHtml(c.ref)}</div></td>
            <td class="check-status ${c.ok ? 'ok' : 'fail'}">${c.ok ? 'OK' : 'FAIL'}</td>
        </tr>`;
const checkRow = (c) => {
    if (!c.active) return `<tr>
                <td><div class="check-name">${c.name}</div><div class="check-ref">${refHtml(c.ref)}</div></td>
                <td class="sym">${k(c.expr)}</td>
                <td class="check-ratio">-</td>
                <td><span class="check-bar-wrap"></span></td>
                <td class="check-status na">N/A</td>
            </tr>`;
    const ok = c.r <= 1.0, pct = Math.min(c.r * 100, 100);
    const colour = ok ? 'var(--c-ok)' : 'var(--c-fail)';
    return `<tr>
                <td><div class="check-name">${c.name}</div><div class="check-ref">${refHtml(c.ref)}</div></td>
                <td class="sym">${k(c.expr)}</td>
                <td class="check-ratio">${c.r.toFixed(3)}</td>
                <td><span class="check-bar-wrap"><span class="check-bar-fill" style="width:${pct}%;background:${colour}"></span></span></td>
                <td class="check-status ${ok ? 'ok' : 'fail'}">${ok ? 'OK' : 'FAIL'}</td>
            </tr>`;
};
const isUtilisationNote = (note) => String(note ?? '').trim().startsWith('(utilisation =');

function formatOutputCell(c) {
    if (Array.isArray(c.tex.resultRows)) {
        return c.tex.resultRows
            .map(part => `<span class="out-line">${k(part)}</span>`)
            .join('');
    }

    let html = `<span class="out-line">${k(c.tex.result)}</span>`;
    if (isUtilisationNote(c.tex.note)) {
        html += `<span class="footnote">${renderNoteHtml(c.tex.note)}</span>`;
    }
    if (typeof c.ng === 'boolean') {
        html += `<span class="${c.ng ? 'fail' : 'ok'}">${c.ng ? 'FAIL' : 'OK'}</span>`;
    }
    if (c.tex.outputNote) {
        html += `<span class="footnote">${renderNoteHtml(c.tex.outputNote)}</span>`;
    }
    return html;
}
const calcRow = (c) => `<tr>
            <td class="ref">${refHtml(c.ref)}</td>
            <td class="calc">
                <div class="calc-name">${c.title}</div>
                ${c.calcNote ? `<div class="footnote">${renderNoteHtml(c.calcNote)}</div>` : ''}
                <div class="calc-eq">${kd(c.tex.sym)}</div>
                ${c.tex.sub ? `<div class="calc-eq">${kd(c.tex.sub)}</div>` : ''}
            </td>
            <td class="out">${formatOutputCell(c)}</td>
        </tr>`;

// ---------- Form input collection ----------
function collectInputs() {
    return {
        // Geometry
        D: gv('D'), t: gv('t'), bow: gv('bow'),
        // Material
        species: gs('species'),
        fmk: gv('fmk'), fc0k: gv('fc0k'), ft0k: gv('ft0k'), fvk: gv('fvk'),
        Ek_mean: gv('Ek_mean'),
        // Service / load context
        sc: gs('sc'),
        ld: gs('ld'),
        crClass: gs('crClass'),
        Tsvc: gv('Tsvc'),
        // Member + boundary conditions
        L: gv('L'),
        K: gv('K'),
        n_culms: gv('n_culms'),
        bundle_grid: gs('bundle_grid'),
        e_axial: gv('e_axial'),
        // ASD demands
        M: gv('M'), V: gv('V'), Pc: gv('Pc'), Pt: gv('Pt'),
        // Project header
        company: $('hdr-company').value,
        reportTitle: $('hdr-report-title').value,
        job: $('hdr-job').value,
        madeBy: $('hdr-made').value,
        checked: $('hdr-checked').value,
        date: $('hdr-date').value,
        project: $('hdr-project').value,
        component: $('hdr-component').value,
    };
}

// ---------- Render the response into the page ----------
function applyAppliedProps(applied, speciesKey) {
    if (!applied) return;
    const fields = [
        ['fmk', applied.fmk], ['fc0k', applied.fc0k], ['ft0k', applied.ft0k],
        ['fvk', applied.fvk], ['Ek_mean', applied.Ek_mean],
    ];
    const lock = speciesKey !== 'custom';
    for (const [id, val] of fields) {
        const el = $(id);
        if (lock) {
            if (val != null && isFinite(val)) el.value = val;
            el.readOnly = true;
        } else {
            el.readOnly = false;
        }
    }
}
function renderVerdict(v) {
    const card = $('verdict-card');
    card.classList.remove('ok', 'fail');
    card.classList.add(v.ok ? 'ok' : 'fail');
    $('verdict-badge').textContent = v.badge;
    $('verdict-headline').textContent = '';
    $('verdict-util').textContent = Number(v.util ?? 0).toFixed(1);
    $('verdict-gov').textContent = v.governing ?? '\u2014';
}
function renderScope(lines) {
    if (!lines || !lines.length) { $('scope').style.display = 'none'; return; }
    $('scope').style.display = '';
    $('scope').innerHTML = lines.map(renderNoteHtml).join('<br>');
}
function renderResponse(r) {
    bkTable('props-body', r.propsRows);
    $('caption').textContent = r.caption || `\u00D8 ${gv('D').toFixed(0)} \u00D7 ${gv('t').toFixed(1)} (mm)`;
    renderVerdict(r.verdict);
    // Scope panel is owned by the client (see SCOPE_NOTE / bootstrap);
    // intentionally NOT touched here.
    $('class-body').innerHTML = r.inputs.classRows.map(classRow).join('');
    bkTable('forces-body', r.inputs.forcesRows);
    bkTable('resist-body', r.inputs.resistRows);
    $('checks-body').innerHTML = r.inputs.checks.map(checkRow).join('');
    $('calc-body').innerHTML = r.calc.map(calcRow).join('');
    applyAppliedProps(r.appliedProps, gs('species'));
}

// ---------- Action handlers ----------
function showError(msg) {
    const html = renderNoteHtml('**Error:** ' + msg);
    ['err-banner', 'err-banner-bottom'].forEach(id => {
        const b = $(id);
        if (b) {
            b.innerHTML = html;
            b.classList.add('show');
        }
    });
}
function clearError() {
    ['err-banner', 'err-banner-bottom'].forEach(id => {
        const b = $(id);
        if (b) b.classList.remove('show');
    });
}

let lastResponse = null;
async function update() {
    syncBundleGridOptions();
    const inputs = collectInputs();
    try {
        const result = window.BAMBOO_CALC.runCalculation(inputs);
        lastResponse = result;
        clearError();
        renderResponse(result);
        drawSection();
    } catch (e) {
        showError(e.message);
    }
}
function formatLocalDateForInput(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function sanitizePrintTitlePart(value) {
    return String(value ?? '')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^-+|-+$/g, '');
}

function buildPrintDocumentTitle(inputs, fallbackTitle = 'Bamboo Culm Sizer') {
    const parts = [inputs?.date, inputs?.component, inputs?.project]
        .map(sanitizePrintTitlePart);

    return parts.every(Boolean) ? parts.join('-') : fallbackTitle;
}

function downloadPdf() {
    const btn = $('download-pdf');
    const originalDocumentTitle = document.title;
    const originalButtonText = btn.textContent;
    const printClass = 'print-calculations-only';
    btn.disabled = true;
    btn.textContent = 'Preparing PDF...';

    try {
        const inputs = collectInputs();
        window.BAMBOO_CALC.runCalculation(inputs);
        clearError();

        let didCleanupPrintMode = false;
        const cleanupPrintMode = () => {
            if (didCleanupPrintMode) return;
            didCleanupPrintMode = true;
            document.body.classList.remove(printClass);
            document.title = originalDocumentTitle;
            window.removeEventListener('afterprint', cleanupPrintMode);
            btn.disabled = false;
            btn.textContent = originalButtonText;
        };

        document.title = buildPrintDocumentTitle(inputs, originalDocumentTitle);
        document.body.classList.add(printClass);
        window.addEventListener('afterprint', cleanupPrintMode);
        window.requestAnimationFrame(() => {
            window.print();
            window.setTimeout(cleanupPrintMode, 1000);
        });
    } catch (e) {
        document.body.classList.remove(printClass);
        document.title = originalDocumentTitle;
        showError(e.message);
        btn.disabled = false;
        btn.textContent = originalButtonText;
    }
}

// ---------- Wiring ----------
let updateTimer = null;
function scheduleUpdate() {
    clearTimeout(updateTimer);
    // Defer until KaTeX is ready so we never render raw LaTeX into the DOM.
    if (!_katexReady) { updateTimer = setTimeout(scheduleUpdate, 50); return; }
    updateTimer = setTimeout(update, 200);
}
if (typeof document !== 'undefined') {
    $('download-pdf').addEventListener('click', downloadPdf);
    ['D', 't'].forEach(id => {
        $(id).addEventListener('input', drawSection);
    });
    document.querySelectorAll('input.num, select.inline, input.txt').forEach(el => {
        el.addEventListener('input', scheduleUpdate);
        el.addEventListener('change', scheduleUpdate);
    });

    const dateInput = $('hdr-date');
    if (dateInput && !dateInput.value) dateInput.value = formatLocalDateForInput();

    (function bootstrap() {
        if (typeof katex === 'undefined') { setTimeout(bootstrap, 30); return; }
        _katexReady = true;
        renderInlineMath();
        renderScope(SCOPE_NOTE);
        syncBundleGridOptions();
        drawSection();
        update();
    }());
}

if (typeof module === 'object' && module.exports) {
    module.exports = {
        buildPrintDocumentTitle,
        formatLocalDateForInput,
        sanitizePrintTitlePart,
    };
}

