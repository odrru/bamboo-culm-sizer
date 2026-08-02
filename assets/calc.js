// Browser-global build of the Bamboo Culm Sizer member-design engine.
// Source of truth: bamboo-culm-sizer-pro/src/lib/calc at commit 7b00fe1.
(function attachBambooCalculator(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.BAMBOO_CALC = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createBambooCalculator() {
    "use strict";

const SPECIES = {
    manual_scheme: {
        name: "Manual Table 4.4 - scheme design (IStructE 2025)",
        fmk: 40,
        fc0k: 35,
        ft0k: 40,
        fvk: 3,
        Ek_mean: 10000,
        source: "from Manual Table 4.4",
    },
};

const C_DF = {
    "1": { long: 0.60, medium: 0.75, instant: 1.00 },
    "2": { long: 0.55, medium: 0.65, instant: 0.85 },
    "3": { long: null, medium: null, instant: null },
};

const C_DE = {
    "1": { long: 0.50, medium: 1.00, instant: 1.00 },
    "2": { long: 0.45, medium: 0.95, instant: 1.00 },
    "3": { long: null, medium: null, instant: null },
};

const C_R_OPTS = { non_redundant: 0.90, standard: 1.00, redundant: 1.10 };

const LD_LABELS = {
    long: "Permanent & Long-term",
    medium: "Transient",
    instant: "Instantaneous",
};

const FS_AXIAL = 2;
const FS_SHEAR = 4;
const FS_M = 2;
const C_YLINEN = 0.80;

const REFS = {
    area: "ISO 22156 (2021) Clause 6.4.1, Formula (3)",
    secondMoment: "ISO 22156 (2021) Clause 6.4.1, Formula (4)",
    sectionModulus: "ISO 22156 (2021) Clause 6.4.1, Formula (5)",
    allowableStrengths: "ISO 22156 (2021) Clause 6.4, Formula (2) / IStructE Manual (2025) Eq. 3.9",
    designModulus: "ISO 22156 (2021) Clause 6.6, Formula (7) / IStructE Manual (2025) Eq. 3.10",
    bendingResistance: "ISO 22156 (2021) Clause 8.3.2, Formula (12) / IStructE Manual (2025) Section 6.7.1, Eq. 6.6b",
    shearResistance: "ISO 22156 (2021) Clause 8.3.2, Formulae (12) and (13) / IStructE Manual (2025) Section 6.9, Eq. 6.13 and Eq. 6.14",
    compressionCrushing: "ISO 22156 (2021) Clause 9.3.2, Formula (21) / IStructE Manual (2025) Section 6.4.2",
    tensionResistance: "ISO 22156 (2021) Clause 9.4.2, Formula (25) / IStructE Manual (2025) Section 6.5",
    bowReduction: "ISO 22156 (2021) Clause 9.2.1, Formulae (18) and (19) / IStructE Manual (2025) Section 6.4.2, Eq. 6.4",
    characteristicCrushing: "IStructE Manual (2025) Section 6.4.2, Eq. 6.2",
    characteristicEuler: "IStructE Manual (2025) Section 6.4.2, Eq. 6.3",
    ylinenCapacity: "IStructE Manual (2025) Section 6.4.2, Eq. 6.1 / IStructE Manual (2025) Appendix A6.2",
    bucklingResistance: "IStructE Manual (2025) Section 6.4.2, Eq. 6.5",
    momentMagnifier: "IStructE Manual (2025) Section 6.8, Eq. 6.11a",
    compressionPlusBending: "ISO 22156 (2021) Clause 9.5, Formula (26) / IStructE Manual (2025) Section 6.8, Eq. 6.10 and Eq. 6.11a",
    tensionPlusBending: "ISO 22156 (2021) Clause 9.5, Formula (27) / IStructE Manual (2025) Section 6.8, Eq. 6.10 and Eq. 6.11b",
};

const MAX_BUNDLE_COUNT = 12;

const f = (x, d = 2) => (x == null || isNaN(x)) ? "-" : Number(x).toFixed(d);

const fInt = (x) => {
    if (x == null || isNaN(x)) return "-";
    const n = Math.round(Number(x));
    return String(n).replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1\\,");
};

const cdotChain = (...nums) => nums.join(" \\cdot\\allowbreak ");

const num = (v, fb = 0) => {
    const n = +v;
    return isFinite(n) ? n : fb;
};

const numDefault = (v, fb) => {
    if (v == null || v === "") return fb;
    const n = +v;
    return isFinite(n) ? n : fb;
};

function nonNeg(v, label) {
    const n = num(v);
    if (n < 0) throw new Error(`${label} must be non-negative.`);
    return n;
}

function positive(v, fb, label) {
    const n = v == null ? fb : +v;
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be positive.`);
    return n;
}

function requirePositive(n, label) {
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be positive.`);
    return n;
}

function utilisationRatio(active, demand, resistance, label) {
    if (!active) return 0;
    if (!Number.isFinite(demand)) throw new Error(`${label} demand must be finite.`);
    if (!Number.isFinite(resistance) || resistance <= 0) {
        throw new Error(`${label} resistance must be positive for an active demand.`);
    }
    return demand / resistance;
}

function tempFactor(Tc) {
    if (!isFinite(Tc) || Tc <= 38) return 1.0;
    if (Tc >= 65) return 0.70;
    return 1.0 - 0.30 * (Tc - 38) / (65 - 38);
}

function cbow(b_o) {
    if (!(b_o >= 0)) {
        throw new Error("Bow $b_o$ must be a non-negative number.");
    }
    if (b_o > 0.02) {
        throw new Error("Bow $b_o$ exceeds ISO 22156 (2021) Clause 9.1 limit of 0.02 (Manual Table 3.1).");
    }
    return 1 - b_o / 0.02;
}

function calculateModificationFactors(b = {}) {
    const sc = String(b.sc || "2");
    const ld = b.ld || "medium";
    const cdfRaw = C_DF[sc] && C_DF[sc][ld];
    const cdfFellBack = (cdfRaw == null);
    const cdf = cdfFellBack ? C_DF["2"][ld] : cdfRaw;
    const cdeRaw = C_DE[sc] && C_DE[sc][ld];
    const cdeFellBack = (cdeRaw == null);
    const cde = cdeFellBack ? C_DE["2"][ld] : cdeRaw;
    const CR = C_R_OPTS[b.crClass] ?? 1.0;
    const Tsvc = num(b.Tsvc, 25);
    const CT = tempFactor(Tsvc);
    const bow = num(b.bow, NaN);
    const C_bow = Number.isFinite(bow) && bow >= 0 && bow <= 0.02
        ? 1 - bow / 0.02
        : NaN;

    return { sc, ld, cdf, cdfFellBack, cde, cdeFellBack, CR, Tsvc, CT, bow, C_bow };
}

function hasBandDivisor(N) {
    const count = Math.floor(num(N));
    if (count < 1) return false;
    const lower = Math.sqrt(count / 3);
    const upper = Math.floor(Math.sqrt(count));
    for (let m = 1; m <= upper; m++) {
        if (count % m === 0 && m >= lower) return true;
    }
    return false;
}

function buildPicker(MAX = MAX_BUNDLE_COUNT) {
    const limit = Math.max(1, Math.floor(num(MAX, MAX_BUNDLE_COUNT)));
    const list = [];
    for (let N = 1; N <= limit; N++) {
        if (N === 7 || hasBandDivisor(N)) list.push(N);
    }
    return list;
}

function shapeFor(N, d) {
    const count = Math.floor(num(N));
    const diameter = num(d);
    if (count === 1) return { type: "single", culms: 1, overallDiameter: diameter };
    if (count === 7) return { type: "circular", rings: 1, overallDiameter: 3 * diameter };

    const lower = Math.sqrt(count / 3);
    const upper = Math.floor(Math.sqrt(count));
    const options = [];
    for (let m = 1; m <= upper; m++) {
        if (count % m === 0 && m >= lower) {
            const n = count / m;
            options.push({
                grid: `${m}x${n}`,
                width: m * diameter,
                depth: n * diameter,
                ratio: n / m,
            });
        }
    }

    options.sort((a, b) => a.ratio - b.ratio || a.width - b.width);
    return { type: "rectangular", options };
}

function calcSection(D, t) {
    if (!(D > 0)) throw new Error("Outer diameter $D$ must be positive.");
    if (!(t > 0)) throw new Error("Wall thickness $t$ must be positive.");
    if (t >= D / 2) throw new Error("Wall thickness $t$ must be less than $D/2$.");
    const di = D - 2 * t;
    const A = Math.PI / 4 * (D * D - di * di);
    const I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(di, 4));
    const S = I / (D / 2);
    return { D, t, di, A, I, S, Dt: D / t };
}

// Bamboo Culm Sizer calculation logic.
// ---------- calculate ----------
// Member-level ASD checks per IStructE Manual (2025).
// Scope: bending, shear, axial compression (short + Ylinen buckling),
//        axial tension, combined compression + bending, combined tension + bending.
//
//
// NOTE: The user-facing scope/disclaimer copy is owned by the client
// (see SCOPE_NOTE in the React UI). It is NOT returned from this function so
// that calculation errors can never blank or alter the disclaimer panel.


// ---------- Main calc ----------
function runCalculation(b) {
    // Geometry
    const D = num(b.D, 100), t = num(b.t, 10);
    const sec = calcSection(D, t);

    // Imperfections
    const bow = nonNeg(b.bow, 'Bow $b_o$');

    // Species
    const speciesKey = b.species || 'manual_scheme';
    let sp;
    if (speciesKey === 'custom') {
        const defaults = SPECIES.manual_scheme;
        sp = {
            name: 'Custom (project-specific)',
            fmk: numDefault(b.fmk, defaults.fmk),
            fc0k: numDefault(b.fc0k, defaults.fc0k),
            ft0k: numDefault(b.ft0k, defaults.ft0k),
            fvk: numDefault(b.fvk, defaults.fvk),
            Ek_mean: numDefault(b.Ek_mean, defaults.Ek_mean),
            source: 'User Input',
        };
    } else {
        sp = { ...(SPECIES[speciesKey] || SPECIES.manual_scheme) };
    }
    requirePositive(sp.fmk, 'Bending strength $f_{m,k}$');
    requirePositive(sp.fc0k, 'Compression strength $f_{c,0,k}$');
    requirePositive(sp.ft0k, 'Tension strength $f_{t,0,k}$');
    requirePositive(sp.fvk, 'Shear strength $f_{v,k}$');
    requirePositive(sp.Ek_mean, 'Mean characteristic modulus $E_{k,mean}$');

    // Service / load context
    const { sc, ld, cdf, cdfFellBack, cde, cdeFellBack, CR, Tsvc, CT } = calculateModificationFactors(b);

    const E_d = sp.Ek_mean * cde * CT;

    // Member stability parameters
    const Lm = positive(b.L, 3, 'Member length $L$');
    const Lmm = Lm * 1000;
    const K = positive(b.K, 1.0, 'Effective length factor $K$');
    const KL = K * Lmm;
    const n_culms = Math.max(1, Math.round(num(b.n_culms, 1)));
    const bundleShape = shapeFor(n_culms, D);

    // ASD demands
    const M = num(b.M);
    const V = num(b.V);
    const Pc = nonNeg(b.Pc, 'Compression $P_c$');
    const Pt = nonNeg(b.Pt, 'Tension $P_t$');
    const e_axial = nonNeg(b.e_axial, 'Eccentricity $e_{axial}$');

    // Allowable stresses
    const fAxial = CR * cdf * CT / FS_AXIAL;
    const fShear = CR * cdf * CT / FS_SHEAR;
    const fm_allow = sp.fmk * fAxial;
    const fc0_allow = sp.fc0k * fAxial;
    const ft0_allow = sp.ft0k * fAxial;
    const fv_allow = sp.fvk * fShear;

    // Section resistances
    const M_allow = n_culms * sec.S * fm_allow / 1e6; // kNm - Eq. 6.6b: M_f = f_m x sum(S_i)
    const V_allow = n_culms * sec.A * fv_allow / 2 / 1000;   // kN
    const Pt_allow = n_culms * sec.A * ft0_allow / 1000; // kN

    // Short-column compression resistance matches the buckling path (P_ck)
    // so paired/bundled members are not artificially penalised on this check.
    const Pc_allow_0 = n_culms * sec.A * fc0_allow / 1000; // kN - short-column

    // ---------- Buckling - IStructE Manual (2025) Section 6.4.2 (Ylinen) ----------
    const C_bow = cbow(bow);
    if (Pc > 0 && C_bow <= 0) {
        throw new Error(
            'Bow $b_o$ must be less than 0.02 for compression checks; ' +
            '$b_o = 0.02$ gives zero buckling capacity.'
        );
    }
    const P_ck = sp.fc0k * sec.A * n_culms / 1000;
    const P_ek = n_culms * Math.PI ** 2 * sp.Ek_mean * sec.I * C_bow / (KL * KL) / 1000;

    let N_cr_k;
    if (P_ek <= 0) {
        N_cr_k = 0;
    } else {
        const sum = P_ck + P_ek;
        const term = sum / (2 * C_YLINEN);
        const inner = term * term - (P_ck * P_ek) / C_YLINEN;
        N_cr_k = term - Math.sqrt(Math.max(0, inner));
    }
    const Pc_allow = N_cr_k * CR * CT * cdf / FS_M;

    // ---------- Stresses & utilisation ratios ----------
    const sigma_m = (sec.S > 0) ? Math.abs(M) * 1e6 / (n_culms * sec.S) : 0;
    const sigma_c = Pc > 0 ? Pc * 1000 / (n_culms * sec.A) : 0;
    const sigma_t = Pt > 0 ? Pt * 1000 / (n_culms * sec.A) : 0;

    const r_bend = utilisationRatio(Math.abs(M) > 0, Math.abs(M), M_allow, 'Bending');
    const r_shear = utilisationRatio(Math.abs(V) > 0, Math.abs(V), V_allow, 'Shear');
    const r_comp = utilisationRatio(Pc > 0, Pc, Pc_allow_0, 'Compression crushing');
    const r_tens = utilisationRatio(Pt > 0, Pt, Pt_allow, 'Tension');
    const r_buck = utilisationRatio(Pc > 0, Pc, Pc_allow, 'Compression buckling');

    // Combined axial + bending. Eq. 6.10 uses force and moment resistances;
    // B = 1 for tension members per Eq. 6.11b.
    let r_NM_c = 0, B_amp = 1, M_d_c_eff = Math.abs(M);
    const M_d_t_eff = (Pt > 0 && Math.abs(M) > 0)
        ? Math.abs(M) + Pt * (e_axial / 1000)
        : Math.abs(M);
    if (Pc > 0 && Math.abs(M) > 0) {
        M_d_c_eff = Math.abs(M) + Pc * (e_axial / 1000);
        if (N_cr_k > 0 && Pc < N_cr_k) {
            B_amp = 1 / (1 - Pc / N_cr_k);
        } else if (N_cr_k > 0 && Pc >= N_cr_k) {
            throw new Error(
                'Combined-action magnifier $B$ is non-physical - applied $P_c$ (' + f(Pc) +
                ' kN) approaches or exceeds $N_{cr,k}$ (' + f(N_cr_k) + ' kN). ' +
                'Reduce $P_c$, shorten $KL$, or use a larger section.'
            );
        } else {
            B_amp = 1;
        }
        r_NM_c = utilisationRatio(true, Pc, Pc_allow, 'Combined compression axial term')
            + B_amp * utilisationRatio(true, M_d_c_eff, M_allow, 'Combined compression bending term');
    }

    // Combined Tension + Bending
    const r_NM_t = (Pt > 0 && Math.abs(M) > 0)
        ? utilisationRatio(true, Pt, Pt_allow, 'Combined tension axial term')
            + utilisationRatio(true, M_d_t_eff, M_allow, 'Combined tension bending term')
        : 0;

    // ---------- Property panel ----------
    const propsRows = [
        { name: 'Cross-Section Area', sym: 'A', val: `${sec.A.toFixed(2)} mm\u00B2` },
        { name: 'Second Moment of Area', sym: 'I', val: `${(sec.I / 1e4).toFixed(2)} cm\u2074` },
        { name: 'Section Modulus', sym: 'S', val: `${(sec.S / 1e3).toFixed(2)} cm\u00B3` },
        { name: 'Inner Diameter', sym: 'd_i', val: `${sec.di.toFixed(2)} mm` },
        { name: 'Effective Length', sym: 'KL', val: `${KL.toFixed(0)} mm` },
        { name: 'Bow Reduction Factor', sym: 'C_{bow}', val: C_bow.toFixed(3) },
        { name: 'Redundancy Factor', sym: 'C_R', val: CR.toFixed(2) },
        { name: 'Load Duration Factor', sym: 'C_{DF}', val: cdf.toFixed(2) + (cdfFellBack ? ' (SC 2 fallback)' : '') },
        { name: 'Load Duration Factor (modulus)', sym: 'C_{DE}', val: cde.toFixed(2) + (cdeFellBack ? ' (SC 2 fallback)' : '') },
        { name: 'Temperature Factor', sym: 'C_T', val: CT.toFixed(2) },
        { name: 'Mean characteristic modulus', sym: 'E_{k,mean}', val: `${Math.round(sp.Ek_mean)} MPa` },
        { name: 'Design Modulus', sym: 'E_d', val: `${Math.round(E_d)} MPa` },
        { name: 'Source', sym: '--', val: sp.source },
        { name: 'Allowable Bending Stress', sym: 'f_{m,allow}', val: `${fm_allow.toFixed(2)} MPa` },
        { name: 'Allowable Compressive Stress', sym: 'f_{c,0,allow}', val: `${fc0_allow.toFixed(2)} MPa` },
        { name: 'Allowable Tensile Stress', sym: 'f_{t,0,allow}', val: `${ft0_allow.toFixed(2)} MPa` },
        { name: 'Allowable Shear Stress', sym: 'f_{v,allow}', val: `${fv_allow.toFixed(2)} MPa` },
    ];

    // ---------- Classification ----------
    const classRows = [
        { name: 'Wall Slenderness Guidance', sym: 'D/t', val: sec.Dt, ok: sec.Dt <= 12, lim: '\\leq 12', ref: 'ISO 22156 (2021) Annex A / IStructE Manual (2025) Chapter 3 (Table 3.1)' },
        { name: 'Practical Diameter Guidance', sym: 'D', val: sec.D, ok: sec.D >= 50, lim: '\\geq 50\\ \\text{mm}', ref: 'ISO 22156 (2021) Annex A / IStructE Manual (2025) Chapter 3' },
        { name: 'Bow', sym: 'b_0', val: bow, ok: bow <= 0.02, lim: '\\leq 0.02\\ \\text{(0.01 pref.)}', ref: 'IStructE Manual (2025) Table 3.1' },
    ];

    // ---------- Forces / Resistances ----------
    const forcesRows = [
        { name: 'Bending Moment', sym: 'M', val: `${M.toFixed(3)} kNm` },
        { name: 'Shear', sym: 'V', val: `${V.toFixed(2)} kN` },
        { name: 'Compression', sym: 'P_c', val: `${Pc.toFixed(2)} kN` },
        { name: 'Tension', sym: 'P_t', val: `${Pt.toFixed(2)} kN` },
    ];
    if (Pc > 0 && Math.abs(M) > 0 && e_axial > 0) {
        forcesRows.push({ name: 'Effective Moment (compression eccentricity)', sym: 'M_{d,c}', val: `${M_d_c_eff.toFixed(3)} kNm` });
    }
    if (Pt > 0 && Math.abs(M) > 0 && e_axial > 0) {
        forcesRows.push({ name: 'Effective Moment (tension eccentricity)', sym: 'M_{d,t}', val: `${M_d_t_eff.toFixed(3)} kNm` });
    }

    const resistRows = [
        { name: 'Bending Resistance', sym: 'M_{allow}', val: `${M_allow.toFixed(3)} kNm` },
        { name: 'Shear Resistance', sym: 'V_{allow}', val: `${V_allow.toFixed(2)} kN` },
        { name: 'Compression Resistance (buckling)', sym: 'P_{c,allow}', val: `${Pc_allow.toFixed(2)} kN` },
        { name: 'Compression Resistance (crushing)', sym: 'P_{c,allow,0}', val: `${Pc_allow_0.toFixed(2)} kN` },
        { name: 'Tension Resistance', sym: 'P_{t,allow}', val: `${Pt_allow.toFixed(2)} kN` },
    ];
    // ---------- Verification checks ----------
    const checks = [
        { name: 'Bending', ref: REFS.bendingResistance, expr: 'M / M_{allow}', r: r_bend, active: Math.abs(M) > 0 },
        { name: 'Shear', ref: REFS.shearResistance, expr: 'V / V_{allow}', r: r_shear, active: Math.abs(V) > 0 },
        { name: 'Compression (crushing)', ref: REFS.compressionCrushing, expr: 'P_c / P_{c,allow,0}', r: r_comp, active: Pc > 0 },
        { name: 'Tension', ref: REFS.tensionResistance, expr: 'P_t / P_{t,allow}', r: r_tens, active: Pt > 0 },
        { name: 'Compression (buckling)', ref: REFS.bucklingResistance, expr: 'P_c / P_{c,allow}', r: r_buck, active: Pc > 0 },
        { name: 'Combined Compression + Bending', ref: REFS.compressionPlusBending, expr: '\\dfrac{P_c}{P_{c,allow}} + B \\cdot \\dfrac{M_d}{M_{allow}}', r: r_NM_c, active: Pc > 0 && Math.abs(M) > 0 },
        { name: 'Combined Tension + Bending', ref: REFS.tensionPlusBending, expr: '\\dfrac{P_t}{P_{t,allow}} + \\dfrac{M_d}{M_{allow}}', r: r_NM_t, active: Pt > 0 && Math.abs(M) > 0 },
    ];

    if (checks.filter(c => c.active).length === 0) {
        throw new Error('No demands provided - enter at least one of $M$, $V$, $P_c$, $P_t$.');
    }
    const active = checks.filter(c => c.active);
    const governing = active.reduce((a, b2) => (b2.r > a.r ? b2 : a));
    const allOk = governing.r <= 1.0;

    // ---------- Calc breakdown table ----------
    const utilNote = (expr, ratio) => `(utilisation = $${expr}$ = ${f(ratio, 3)})`;
    const calc = [
        {
            title: 'Inner Diameter', sym: 'd_i', ref: 'Geometry',
            tex: {
                sym: 'd_i = D - 2t',
                sub: `d_i = ${f(sec.D)} - 2\\cdot ${f(sec.t)}`,
                result: `d_i = ${f(sec.di)}\\ \\text{mm}`
            }
        },
        {
            title: 'Cross-Section Area', sym: 'A', ref: REFS.area,
            tex: {
                sym: 'A = \\dfrac{\\pi}{4}\\,(D^{2} - d_i^{2})',
                sub: `A = \\dfrac{\\pi}{4}\\,(${f(sec.D)}^{2} - ${f(sec.di)}^{2})`,
                result: `A = ${f(sec.A, 1)}\\ \\text{mm}^{2}`
            }
        },
        {
            title: 'Second Moment of Area', sym: 'I', ref: REFS.secondMoment,
            tex: {
                sym: 'I = \\dfrac{\\pi}{64}\\,(D^{4} - d_i^{4})',
                sub: `I = \\dfrac{\\pi}{64}\\,(${f(sec.D)}^{4} - ${f(sec.di)}^{4})`,
                result: `I = ${f(sec.I / 1e4)}\\ \\text{cm}^{4}`
            }
        },
        {
            title: 'Elastic Section Modulus', sym: 'S', ref: REFS.sectionModulus,
            tex: {
                sym: 'S = \\dfrac{2I}{D}',
                sub: `S = \\dfrac{2 \\cdot ${fInt(sec.I)}}{${f(sec.D)}}`,
                result: `S = ${f(sec.S / 1e3)}\\ \\text{cm}^{3}`
            }
        },
        {
            title: 'Wall Slenderness Guidance', sym: 'D/t',
            ref: 'ISO 22156 (2021) Annex A / IStructE Manual (2025) Chapter 3 (Table 3.1)',
            calcNote: 'Recommended geometry limit intended to reduce the risk of local wall buckling.',
            tex: {
                sym: '\\dfrac{D}{t} \\leq 12',
                sub: `\\dfrac{D}{t} = \\dfrac{${f(sec.D)}}{${f(sec.t)}}`,
                result: sec.Dt <= 12
                    ? `D/t = ${f(sec.Dt, 2)}\\ \\leq 12`
                    : `D/t = ${f(sec.Dt, 2)}\\ > 12`
            }
        },
        {
            title: 'Practical Diameter Guidance', sym: 'D',
            ref: 'ISO 22156 (2021) Annex A / IStructE Manual (2025) Chapter 3',
            calcNote: 'Practical structural-culm guideline, not an absolute universal minimum.',
            tex: {
                sym: 'D \\geq 50\\ \\text{mm}',
                sub: `D = ${f(sec.D)}\\ \\text{mm}`,
                result: sec.D >= 50
                    ? `D = ${f(sec.D)}\\ \\text{mm}\\ \\geq 50\\ \\text{mm}`
                    : `D = ${f(sec.D)}\\ \\text{mm}\\ < 50\\ \\text{mm}`
            }
        },
        {
            title: 'Bow', sym: 'b_0',
            ref: 'IStructE Manual (2025) Table 3.1',
            ng: bow > 0.02,
            tex: {
                sym: 'b_0 \\leq 0.02\\ \\text{(0.01 preferred)}',
                sub: `b_0 = ${f(bow, 4)}`,
                result: `b_0 = ${f(bow, 4)}\\ \\leq 0.02`,
                note: 'The preferred bow limit is 0.01 where practical.'
            }
        },
        {
            title: 'Modification Factors', sym: 'C_R, C_{DF}, C_{DE}, C_T',
            ref: 'IStructE Manual (2025) Eq. 3.9 / Eq. 3.10; Appendix A3.2',
            tex: {
                sym: '(C_R,\\,C_{DF},\\,C_{DE},\\,C_T)',
                sub: null,
                result: `(${CR.toFixed(2)},\\ ${cdf.toFixed(2)},\\ ${cde.toFixed(2)},\\ ${CT.toFixed(2)})`,
                note: (cdfFellBack || cdeFellBack) ? `$C_{DF}/C_{DE}$ for SC 3 are deferred to ISO 22156 (2021) Clause 5.6.3 - SC 2 row used as a conservative placeholder.` : null
            }
        },
        {
            title: 'Allowable Bending Stress', sym: 'f_{m,allow}',
            ref: REFS.allowableStrengths,
            tex: {
                sym: 'f_{m,allow} = \\dfrac{f_{m,k}\\,C_R\\,C_{DF}\\,C_T}{FS_{ax}}',
                sub: `f_{m,allow} = \\dfrac{${cdotChain(f(sp.fmk, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{m,allow} = ${f(fm_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Compressive Stress', sym: 'f_{c,0,allow}',
            ref: REFS.allowableStrengths,
            tex: {
                sym: 'f_{c,0,allow} = \\dfrac{f_{c,0,k}\\,C_R\\,C_{DF}\\,C_T}{FS_{ax}}',
                sub: `f_{c,0,allow} = \\dfrac{${cdotChain(f(sp.fc0k, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{c,0,allow} = ${f(fc0_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Tensile Stress', sym: 'f_{t,0,allow}',
            ref: REFS.allowableStrengths,
            tex: {
                sym: 'f_{t,0,allow} = \\dfrac{f_{t,0,k}\\,C_R\\,C_{DF}\\,C_T}{FS_{ax}}',
                sub: `f_{t,0,allow} = \\dfrac{${cdotChain(f(sp.ft0k, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{t,0,allow} = ${f(ft0_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Shear Stress', sym: 'f_{v,allow}',
            ref: REFS.allowableStrengths,
            tex: {
                sym: 'f_{v,allow} = \\dfrac{f_{v,k}\\,C_R\\,C_{DF}\\,C_T}{FS_{sh}}',
                sub: `f_{v,allow} = \\dfrac{${cdotChain(f(sp.fvk, 2), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2))}}{${FS_SHEAR}}`,
                result: `f_{v,allow} = ${f(fv_allow)}\\ \\text{MPa}`,
                note: '$FS_{sh}=4$ captures bamboo splitting / cleavage.'
            }
        },
        {
            title: 'Applied Demands (ASD)', sym: 'M,\\ V,\\ P_c,\\ P_t',
            ref: 'User Input',
            tex: {
                sym: 'M,\\ V,\\ P_c,\\ P_t',
                sub: null,
                result: `M = ${f(M, 3)}\\ \\text{kNm},\\quad V = ${f(V)}\\ \\text{kN},\\quad P_c = ${f(Pc)}\\ \\text{kN},\\quad P_t = ${f(Pt)}\\ \\text{kN}`,
                resultRows: [
                    `M = ${f(M, 3)}\\ \\text{kNm}`,
                    `V = ${f(V)}\\ \\text{kN}`,
                    `P_c = ${f(Pc)}\\ \\text{kN}`,
                    `P_t = ${f(Pt)}\\ \\text{kN}`
                ]
            }
        },
        {
            title: 'Bending Resistance', sym: 'M_{allow}',
            ref: REFS.bendingResistance, ng: r_bend > 1,
            tex: {
                sym: 'M_{allow} = f_{m,allow}\\times n_{culms}\\,S',
                sub: `M_{allow} = ${f(fm_allow)} \\times ${n_culms} \\cdot ${fInt(sec.S)}`,
                result: `M_{allow} = ${f(M_allow, 3)}\\ \\text{kNm}`,
                note: utilNote('M / M_{allow}', r_bend)
            }
        },
        {
            title: 'Shear Resistance', sym: 'V_{allow}',
            ref: REFS.shearResistance, ng: r_shear > 1,
            tex: {
                sym: 'V_{allow} = \\dfrac{n_{culms}\\,A\\,f_{v,allow}}{2}\\quad(\\tau_{max}\\approx 2V/A)',
                sub: `V_{allow} = \\dfrac{${n_culms} \\cdot ${f(sec.A, 1)} \\cdot ${f(fv_allow)}}{2}`,
                result: `V_{allow} = ${f(V_allow)}\\ \\text{kN}`,
                note: utilNote('V / V_{allow}', r_shear)
            }
        },
        // Explicit derivation for the crushing compression resistance
        // so the Compression (crushing) check has a matching walkthrough row.
        {
            title: 'Compression Resistance (crushing)', sym: 'P_{c,allow,0}',
            ref: REFS.compressionCrushing, ng: r_comp > 1,
            tex: {
                sym: 'P_{c,allow,0} = n_{culms}\\,A\\,f_{c,0,allow}',
                sub: `P_{c,allow,0} = ${n_culms} \\cdot ${f(sec.A, 1)} \\cdot ${f(fc0_allow)}`,
                result: `P_{c,allow,0} = ${f(Pc_allow_0)}\\ \\text{kN}`,
                note: Pc > 0 ? utilNote('P_c / P_{c,allow,0}', r_comp) : '(no compression demand)'
            }
        },
        {
            title: 'Tension Resistance', sym: 'P_{t,allow}',
            ref: REFS.tensionResistance, ng: r_tens > 1,
            tex: {
                sym: 'P_{t,allow} = n_{culms}\\,A\\,f_{t,0,allow}',
                sub: `P_{t,allow} = ${n_culms} \\cdot ${f(sec.A, 1)} \\cdot ${f(ft0_allow)}`,
                result: `P_{t,allow} = ${f(Pt_allow)}\\ \\text{kN}`,
                note: Pt > 0 ? utilNote('P_t / P_{t,allow}', r_tens) : '(no tension demand)'
            }
        },
        {
            title: 'Bow Reduction Factor', sym: 'C_{bow}',
            ref: REFS.bowReduction,
            tex: {
                sym: 'C_{bow} = 1 - \\dfrac{b_0}{0.02}',
                sub: `C_{bow} = 1 - \\dfrac{${f(bow, 4)}}{0.02}`,
                result: `C_{bow} = ${f(C_bow, 3)}`
            }
        },
        {
            title: 'Char. Crushing Capacity', sym: 'P_{c,k}',
            ref: REFS.characteristicCrushing,
            tex: {
                sym: 'P_{c,k} = f_{c,0,k}\\,A\\,n_{culms}',
                sub: `P_{c,k} = ${f(sp.fc0k, 1)} \\cdot ${f(sec.A, 1)} \\cdot ${n_culms}`,
                result: `P_{c,k} = ${f(P_ck)}\\ \\text{kN}`
            }
        },
        {
            title: 'Mean characteristic modulus', sym: 'E_{k,mean}',
            ref: sp.source,
            tex: {
                sym: 'E_{k,mean}',
                sub: null,
                result: `E_{k,mean} = ${fInt(sp.Ek_mean)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Design Modulus', sym: 'E_d',
            ref: REFS.designModulus,
            tex: {
                sym: 'E_d = E_{k,mean} \\cdot C_{DE} \\cdot C_T',
                sub: `E_d = ${cdotChain(fInt(sp.Ek_mean), cde.toFixed(2), CT.toFixed(2))}`,
                result: `E_d = ${fInt(E_d)}\\ \\text{MPa}`,
                note: (cdfFellBack || cdeFellBack) ? `$C_{DF}/C_{DE}$ for SC 3 are deferred to ISO 22156 (2021) Clause 5.6.3 - SC 2 row used as a conservative placeholder.` : null
            }
        },
        {
            title: 'Char. Euler Capacity', sym: 'P_{e,k}',
            ref: REFS.characteristicEuler,
            tex: {
                sym: 'P_{e,k} = \\dfrac{n_{culms}\\,\\pi^{2}\\,E_{k,mean}\\,I\\,C_{bow}}{(KL)^{2}}',
                sub: `P_{e,k} = \\dfrac{${n_culms}\\,\\pi^{2} \\cdot\\allowbreak ${fInt(sp.Ek_mean)} \\cdot\\allowbreak ${fInt(sec.I)} \\cdot\\allowbreak ${f(C_bow, 3)}}{${fInt(KL)}^{2}}`,
                result: `P_{e,k} = ${f(P_ek)}\\ \\text{kN}`
            }
        },
        {
            title: 'Char. Column Capacity (Ylinen)', sym: 'N_{cr,k}',
            ref: REFS.ylinenCapacity,
            tex: {
                sym: 'N_{cr,k} = s - \\sqrt{s^{2} - \\dfrac{P_{c,k}\\,P_{e,k}}{c}},\\ \\ s=\\dfrac{P_{c,k}+P_{e,k}}{2c}',
                sub: `c = ${C_YLINEN};\\ P_{c,k} = ${f(P_ck)};\\ P_{e,k} = ${f(P_ek)}`,
                result: `N_{cr,k} = ${f(N_cr_k)}\\ \\text{kN}`,
                note: 'Ylinen empirical interaction (Manual Appendix A6.2).'
            }
        },
        {
            title: 'Compression Resistance (buckling)', sym: 'P_{c,allow}',
            ref: REFS.bucklingResistance, ng: r_buck > 1,
            tex: {
                sym: 'P_{c,allow} = \\dfrac{N_{cr,k}\\,C_R\\,C_T\\,C_{DF}}{FS_M}',
                sub: `P_{c,allow} = \\dfrac{${cdotChain(f(N_cr_k), CR.toFixed(2), CT.toFixed(2), cdf.toFixed(2))}}{${FS_M}}`,
                result: `P_{c,allow} = ${f(Pc_allow)}\\ \\text{kN}`,
                note: Pc > 0 ? utilNote('P_c / P_{c,allow}', r_buck) : '(no compression demand)'
            }
        },
    ];

    // Conditional rows - combined compression + bending block.
    if (Pc > 0 && Math.abs(M) > 0 && e_axial > 0) {
        calc.push({
            title: 'Effective Moment (compression eccentricity)', sym: 'M_{d,c}',
            ref: 'IStructE Manual (2025) Section 6.8.1',
            tex: {
                sym: 'M_d = M + P_c\\,\\dfrac{e}{1000}\\quad(e\\ \\text{in mm})',
                sub: `M_d = ${f(M, 3)} + ${f(Pc)}\\cdot\\dfrac{${e_axial.toFixed(1)}}{1000}`,
                result: `M_{d,c} = ${f(M_d_c_eff, 3)}\\ \\text{kNm}`
            }
        });
    }

    if (Pt > 0 && Math.abs(M) > 0 && e_axial > 0) {
        calc.push({
            title: 'Effective Moment (tension eccentricity)', sym: 'M_{d,t}',
            ref: 'IStructE Manual (2025) Section 6.8.1',
            tex: {
                sym: 'M_d = M + P_t\\,\\dfrac{e}{1000}\\quad(e\\ \\text{in mm})',
                sub: `M_d = ${f(M, 3)} + ${f(Pt)}\\cdot\\dfrac{${e_axial.toFixed(1)}}{1000}`,
                result: `M_{d,t} = ${f(M_d_t_eff, 3)}\\ \\text{kNm}`
            }
        });
    }

    if (Pc > 0 && Math.abs(M) > 0) {
        calc.push({
            title: 'Combined-action Magnifier', sym: 'B',
            ref: REFS.momentMagnifier,
            tex: {
                sym: 'B = \\dfrac{1}{1 - P_c / N_{cr,k}}',
                sub: `B = \\dfrac{1}{1 - ${f(Pc)} / ${f(N_cr_k)}}`,
                result: `B = ${f(B_amp, 3)}`,
                note: 'Eq. 6.11a $P\\text{-}\\Delta$ amplifier; denominator uses $N_{cr,k}$ (characteristic Ylinen result, NOT the allowable $P_{c,allow}$).'
            },
        });
        calc.push({
            title: 'Combined N(c) + M Interaction',
            ref: REFS.compressionPlusBending, ng: r_NM_c > 1,
            tex: {
                sym: '\\dfrac{P_c}{P_{c,allow}} + B\\cdot\\dfrac{M_d}{M_{allow}} \\leq 1.0',
                sub: `\\dfrac{${f(Pc)}}{${f(Pc_allow)}} + ${f(B_amp, 3)}\\cdot\\dfrac{${f(M_d_c_eff, 3)}}{${f(M_allow, 3)}}`,
                result: `r_{NM,c} = ${f(r_NM_c, 3)}`,
                note: utilNote('\\dfrac{P_c}{P_{c,allow}} + B\\cdot\\dfrac{M_d}{M_{allow}}', r_NM_c)
            },
        });
    }

    if (Pt > 0 && Math.abs(M) > 0) {
        calc.push({
            title: 'Combined N(t) + M Interaction',
            ref: REFS.tensionPlusBending, ng: r_NM_t > 1,
            tex: {
                sym: '\\dfrac{P_t}{P_{t,allow}} + 1\\cdot\\dfrac{M_d}{M_{allow}} \\leq 1.0',
                sub: `\\dfrac{${f(Pt)}}{${f(Pt_allow)}} + 1.000\\cdot\\dfrac{${f(M_d_t_eff, 3)}}{${f(M_allow, 3)}}`,
                result: `r_{NM,t} = ${f(r_NM_t, 3)}`,
                note: utilNote('\\dfrac{P_t}{P_{t,allow}} + \\dfrac{M_d}{M_{allow}}', r_NM_t)
            },
        });
    }

    // ---------- Applied props ----------
    const appliedProps = {
        speciesName: sp.name,
        fmk: sp.fmk, fc0k: sp.fc0k, ft0k: sp.ft0k, fvk: sp.fvk,
        Ek_mean: sp.Ek_mean,
        source: sp.source,
    };

    return {
        inputs: {
            D: sec.D, t: sec.t, di: sec.di,
            bow, C_bow,
            A: sec.A, I: sec.I, S: sec.S, Dt: sec.Dt,
            species: sp.name, sp,
            sc, ld, cdf, cde, cdeFellBack, CR, CT, Tsvc,
            Ek_mean: sp.Ek_mean, E_d,
            fm_allow, fc0_allow, ft0_allow, fv_allow,
            L: Lm, K, KL, n_culms, e_axial,
            bundleShape,
            M, V, Pc, Pt, M_d_eff: M_d_c_eff, M_d_c_eff, M_d_t_eff, B_amp,
            M_allow, V_allow, Pt_allow, Pc_allow, Pc_allow_0,
            P_ck, P_ek, N_cr_k,
            maxR: governing.r, governing: governing.name,
            classRows, forcesRows, resistRows,
            checks: checks.map(c => ({ name: c.name, ref: c.ref, expr: c.expr, r: c.r, ok: c.r <= 1.0, active: c.active })),
        },
        calc,
        propsRows,
        appliedProps,
        caption: `\u00D8 ${sec.D.toFixed(0)} \u00D7 ${sec.t.toFixed(1)} (mm)`,
        verdict: {
            ok: allOk,
            util: governing.r * 100,
            governing: governing.name,
            badge: allOk ? 'OK' : 'FAIL',
        },
    };
}

    return {
        runCalculation,
        calculateModificationFactors,
        LD_LABELS,
        MAX_BUNDLE_COUNT,
        hasBandDivisor,
        buildPicker,
        shapeFor,
    };
}));
