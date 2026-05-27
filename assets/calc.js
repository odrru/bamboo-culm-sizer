// Client-side Bamboo Culm calculation and LaTeX export logic.

(function(global) {
// ---------- calculate ----------
// Member-level ASD checks per IStructE Manual (2025).
// Scope: bending, shear, axial compression (short + Ylinen buckling),
//        axial tension, combined compression + bending, combined tension + bending.
//
//
// NOTE: The user-facing scope/disclaimer copy is owned by the client
// (see SCOPE_NOTE in index.html). It is NOT returned from this function so
// that calculation errors can never blank or alter the disclaimer panel.

// ---------- Species presets (Manual §4) ----------
const SPECIES = {
    manual_scheme: {
        name: 'Manual Table 4.4 - scheme design (IStructE 2025)',
        fmk: 40,
        fc0k: 35,
        ft0k: 40,
        fvk: 3,
        source: 'IStructE Manual (2025), Table 4.4 - scheme design values for bamboo.',
    },
};

function pickEkFromDt(Dt) {
    return (Dt >= 10) ? 15000 : 10000; // MPa
}

// ---------- Modification factor tables ----------
const C_DF = {
    '1': { long: 0.60, medium: 0.75, instant: 1.00 },
    '2': { long: 0.55, medium: 0.65, instant: 0.85 },
    '3': { long: null, medium: null, instant: null },
};

const C_DE = {
    '1': { long: 0.50, medium: 1.00, instant: 1.00 },
    '2': { long: 0.45, medium: 0.95, instant: 1.00 },
    '3': { long: null, medium: null, instant: null },
};

const C_R_OPTS = { non_redundant: 0.90, standard: 1.00, redundant: 1.10 };

const LD_LABELS = {
    long: 'Permanent & Long-term',
    medium: 'Transient',
    instant: 'Instantaneous',
};


// ---------- ASD framework constants ----------
const FS_AXIAL = 2;
const FS_SHEAR = 4;
const FS_M = 2;
const C_YLINEN = 0.80;

// ---------- Helpers ----------
const f = (x, d = 2) => (x == null || isNaN(x)) ? '-' : Number(x).toFixed(d);
const num = (v, fb = 0) => { const n = +v; return isFinite(n) ? n : fb; };

const fInt = (x) => {
    if (x == null || isNaN(x)) return '-';
    const n = Math.round(Number(x));
    return String(n).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1\\,');
};

const cdotChain = (...nums) => nums.join(' \\cdot\\allowbreak ');

function tempFactor(Tc) {
    if (!isFinite(Tc) || Tc <= 38) return 1.0;
    if (Tc >= 65) return 0.70;
    return 1.0 - 0.30 * (Tc - 38) / (65 - 38);
}

function moistureFactor(mcTest, mcService) {
    if (!isFinite(mcTest) || !isFinite(mcService)) return 1.0;
    if (mcService <= mcTest) return 1.0;
    return Math.max(0.5, 1.0 - 0.03 * (mcService - mcTest));
}

function cbow(b_o) {
    if (!(b_o >= 0)) {
        throw new Error('Bow $b_o$ must be a non-negative number.');
    }
    if (b_o > 0.02) {
        throw new Error('Bow $b_o$ exceeds ISO 22156 §9.1 limit of 0.02 (Manual Table 3.1).');
    }
    return 1 - b_o / 0.02;
}

function calcSection(D, t) {
    if (!(D > 0)) throw new Error('Outer diameter $D$ must be positive.');
    if (!(t > 0)) throw new Error('Wall thickness $t$ must be positive.');
    if (t >= D / 2) throw new Error('Wall thickness $t$ must be less than $D/2$.');
    const di = D - 2 * t;
    const A = Math.PI / 4 * (D * D - di * di);
    const I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(di, 4));
    const S = I / (D / 2);
    return { D, t, di, A, I, S, Dt: D / t };
}

function nonNeg(v, label) {
    const n = num(v);
    if (n < 0) throw new Error(`${label} must be non-negative.`);
    return n;
}

// ---------- Main calc ----------
function runCalculation(b) {
    // Geometry
    const D = num(b.D, 100), t = num(b.t, 10);
    const sec = calcSection(D, t);

    // Imperfections
    const bow = nonNeg(b.bow, 'Bow $b_o$');
    const alphaE = nonNeg(b.alphaE, 'External taper $\\alpha_e$');
    const Ln = num(b.Ln, 300);

    // Species
    const speciesKey = b.species || 'manual_scheme';
    let sp;
    let ekAutoPicked = false;
    if (speciesKey === 'custom') {
        sp = {
            name: 'Custom (project-specific)',
            fmk: num(b.fmk),
            fc0k: num(b.fc0k),
            ft0k: num(b.ft0k),
            fvk: num(b.fvk),
            Ek: num(b.Ek),
            source: 'User-entered values.',
        };
    } else {
        sp = { ...(SPECIES[speciesKey] || SPECIES.manual_scheme) };
        sp.Ek = pickEkFromDt(sec.Dt);
        ekAutoPicked = true;
    }

    // Service / load context
    const sc = String(b.sc || '2');
    const ld = b.ld || 'medium';
    const cdfRaw = C_DF[sc] && C_DF[sc][ld];
    const cdfFellBack = (cdfRaw == null);
    const cdf = cdfFellBack ? C_DF['2'][ld] : cdfRaw;
    const cdeRaw = C_DE[sc] && C_DE[sc][ld];
    const cdeFellBack = (cdeRaw == null);
    const cde = cdeFellBack ? C_DE['2'][ld] : cdeRaw;
    const CR = C_R_OPTS[b.crClass] ?? 1.0;
    const Tsvc = num(b.Tsvc, 25);
    const CT = tempFactor(Tsvc);
    const mcTest = num(b.mcTest, 12);
    const mcSvc = num(b.mcService, 12);
    const CM = moistureFactor(mcTest, mcSvc);
    const CF = num(b.CF, 1.0);

    const E_d = sp.Ek * cde * CT;

    // Member geometry / boundary conditions
    const Lm = num(b.L, 3);
    const Lmm = Lm * 1000;
    const K = num(b.K, 1.0);
    const KL = K * Lmm;
    const n_culms = Math.max(1, Math.round(num(b.n_culms, 1)));

    // ASD demands
    const M = num(b.M);
    const V = num(b.V);
    const Pc = nonNeg(b.Pc, 'Compression $P_c$');
    const Pt = nonNeg(b.Pt, 'Tension $P_t$');
    const e_axial = nonNeg(b.e_axial, 'Eccentricity $e_{axial}$');

    // Allowable stresses
    const fAxial = CR * cdf * CT * CM * CF / FS_AXIAL;
    const fShear = CR * cdf * CT * CM / FS_SHEAR;
    const fm_allow = sp.fmk * fAxial;
    const fc0_allow = sp.fc0k * fAxial;
    const ft0_allow = sp.ft0k * fAxial;
    const fv_allow = sp.fvk * fShear;

    // Section resistances
    const M_allow = sec.S * fm_allow / 1e6;          // kNm
    const V_allow = (sec.A * fv_allow) / 2 / 1000;   // kN
    const Pt_allow = n_culms * sec.A * ft0_allow / 1000; // kN

    // PATCH 1: short-column compression resistance now multiplies by n_culms,
    // matching the buckling path (P_ck) so paired/bundled members are not
    // artificially penalised on the short-column check.
    const Pc_allow_0 = n_culms * sec.A * fc0_allow / 1000; // kN — short-column

    // ---------- Buckling — Manual §6.4.2 (Ylinen) ----------
    const C_bow = cbow(bow);
    const P_ck = sp.fc0k * sec.A * n_culms / 1000;
    const P_ek = n_culms * Math.PI ** 2 * E_d * sec.I * C_bow / (KL * KL) / 1000;

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
    const sigma_m = (sec.S > 0) ? Math.abs(M) * 1e6 / sec.S : 0;
    const sigma_c = Pc > 0 ? Pc * 1000 / (n_culms * sec.A) : 0;
    const sigma_t = Pt > 0 ? Pt * 1000 / (n_culms * sec.A) : 0;

    const r_bend = M_allow > 0 ? Math.abs(M) / M_allow : 0;
    const r_shear = V_allow > 0 ? Math.abs(V) / V_allow : 0;
    const r_comp = Pc > 0 && Pc_allow_0 > 0 ? Pc / Pc_allow_0 : 0;
    const r_tens = Pt > 0 && Pt_allow > 0 ? Pt / Pt_allow : 0;
    const r_buck = Pc > 0 && Pc_allow > 0 ? Pc / Pc_allow : 0;

    // Combined Compression + Bending
    let r_NM_c = 0, B_amp = 1, M_d_eff = Math.abs(M);
    if (Pc > 0 && Math.abs(M) > 0) {
        M_d_eff = Math.abs(M) + Pc * (e_axial / 1000);
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
        r_NM_c = (Pc_allow > 0 ? Pc / Pc_allow : Infinity)
            + B_amp * (M_allow > 0 ? M_d_eff / M_allow : Infinity);
    }

    // Combined Tension + Bending
    const r_NM_t = (Pt > 0 && Math.abs(M) > 0)
        ? sigma_t / ft0_allow + sigma_m / fm_allow
        : 0;

    // ---------- Property panel ----------
    const propsRows = [
        { name: 'Cross-Section Area', sym: 'A', val: `${sec.A.toFixed(2)} mm²` },
        { name: 'Second Moment of Area', sym: 'I', val: `${(sec.I / 1e4).toFixed(2)} cm⁴` },
        { name: 'Section Modulus', sym: 'S', val: `${(sec.S / 1e3).toFixed(2)} cm³` },
        { name: 'Inner Diameter', sym: 'd_i', val: `${sec.di.toFixed(2)} mm` },
        { name: 'Effective Length', sym: 'KL', val: `${KL.toFixed(0)} mm` },
        { name: 'Bow Reduction Factor', sym: 'C_{bow}', val: C_bow.toFixed(3) },
        { name: 'Redundancy Factor', sym: 'C_R', val: CR.toFixed(2) },
        { name: 'Load Duration Factor', sym: 'C_{DF}', val: cdf.toFixed(2) + (cdfFellBack ? ' (SC 2 fallback)' : '') },
        { name: 'Load Duration Factor (modulus)', sym: 'C_{DE}', val: cde.toFixed(2) + (cdeFellBack ? ' (SC 2 fallback)' : '') },
        { name: 'Temperature Factor', sym: 'C_T', val: CT.toFixed(2) },
        { name: 'Moisture Factor', sym: 'C_M', val: CM.toFixed(2) },
        { name: 'Size Factor', sym: 'C_F', val: CF.toFixed(2) },
        { name: 'Characteristic Modulus', sym: 'E_k', val: `${Math.round(sp.Ek)} MPa` },
        { name: 'Design Modulus', sym: 'E_d', val: `${Math.round(E_d)} MPa` },
        { name: 'Allowable Bending Stress', sym: 'f_{m,allow}', val: `${fm_allow.toFixed(2)} MPa` },
        { name: 'Allowable Compressive Stress', sym: 'f_{c,0,allow}', val: `${fc0_allow.toFixed(2)} MPa` },
        { name: 'Allowable Tensile Stress', sym: 'f_{t,0,allow}', val: `${ft0_allow.toFixed(2)} MPa` },
        { name: 'Allowable Shear Stress', sym: 'f_{v,allow}', val: `${fv_allow.toFixed(2)} MPa` },
    ];

    // ---------- Classification ----------
    const classRows = [
        { name: 'Wall Slenderness', sym: 'D/t', val: sec.Dt, ok: sec.Dt <= 12, lim: '\\leq 12', ref: 'ISO 22156 Annex A / IStructE Manual (2025) Chapter 3 (Table 3.1)' },
        { name: 'Outer Diameter', sym: 'D', val: sec.D, ok: sec.D >= 50, lim: '\\geq 50\\ \\text{mm}', ref: 'ISO 22156 Annex A / IStructE Manual (2025) Chapter 3' },
        { name: 'External Taper', sym: '\\alpha_e', val: alphaE, ok: alphaE <= 0.10, lim: '\\leq 0.10', ref: 'IStructE Manual (2025) Table 3.1' },
        { name: 'Bow', sym: 'b_0', val: bow, ok: bow <= 0.02, lim: '\\leq 0.02\\ \\text{(0.01 pref.)}', ref: 'IStructE Manual (2025) Table 3.1' },
    ];

    // ---------- Forces / Resistances ----------
    const forcesRows = [
        { name: 'Bending Moment', sym: 'M', val: `${M.toFixed(3)} kNm` },
        { name: 'Shear', sym: 'V', val: `${V.toFixed(2)} kN` },
        { name: 'Compression', sym: 'P_c', val: `${Pc.toFixed(2)} kN` },
        { name: 'Tension', sym: 'P_t', val: `${Pt.toFixed(2)} kN` },
        { name: 'Bending Stress', sym: '\\sigma_m', val: `${sigma_m.toFixed(2)} MPa` },
    ];
    if (Pc > 0 && Math.abs(M) > 0 && e_axial > 0) {
        forcesRows.push({ name: 'Effective Moment (incl. eccentricity)', sym: 'M_d', val: `${M_d_eff.toFixed(3)} kNm` });
    }

    const resistRows = [
        { name: 'Bending Resistance', sym: 'M_{allow}', val: `${M_allow.toFixed(3)} kNm` },
        { name: 'Shear Resistance', sym: 'V_{allow}', val: `${V_allow.toFixed(2)} kN` },
        { name: 'Char. Crushing Capacity', sym: 'P_{c,k}', val: `${P_ck.toFixed(2)} kN` },
        { name: 'Char. Euler Capacity', sym: 'P_{e,k}', val: `${P_ek.toFixed(2)} kN` },
        { name: 'Char. Column Capacity (Ylinen)', sym: 'N_{cr,k}', val: `${N_cr_k.toFixed(2)} kN` },
        { name: 'Compression Resistance (buckling)', sym: 'P_{c,allow}', val: `${Pc_allow.toFixed(2)} kN` },
        { name: 'Compression Resistance (crushing)', sym: 'P_{c,allow,0}', val: `${Pc_allow_0.toFixed(2)} kN` },
        { name: 'Tension Resistance', sym: 'P_{t,allow}', val: `${Pt_allow.toFixed(2)} kN` },
    ];
    if (Pc > 0 && Math.abs(M) > 0) {
        resistRows.push({ name: 'Combined-action Magnifier', sym: 'B', val: B_amp.toFixed(3) });
    }

    // ---------- Verification checks ----------
    const checks = [
        { name: 'Bending', ref: 'ISO 22156 §8.2 / IStructE Manual (2025) §6.3', expr: 'M / M_{allow}', r: r_bend, active: Math.abs(M) > 0 },
        { name: 'Shear', ref: 'ISO 22156 §8.3 / IStructE Manual (2025) §6.6', expr: 'V / V_{allow}', r: r_shear, active: Math.abs(V) > 0 },
        { name: 'Compression (short)', ref: 'ISO 22156 §8.1 / IStructE Manual (2025) §6.4', expr: '\\sigma_{c,0} / f_{c,0,allow}', r: r_comp, active: Pc > 0 },
        { name: 'Tension', ref: 'ISO 22156 §8.4 / IStructE Manual (2025) §6.5', expr: '\\sigma_{t,0} / f_{t,0,allow}', r: r_tens, active: Pt > 0 },
        { name: 'Buckling', ref: 'IStructE Manual (2025) §6.4.2', expr: 'P_c / P_{c,allow}', r: r_buck, active: Pc > 0 },
        { name: 'Combined Compression + Bending', ref: 'IStructE Manual (2025) §6.8', expr: '\\dfrac{P_c}{P_{c,allow}} + B \\cdot \\dfrac{M_d}{M_{allow}}', r: r_NM_c, active: Pc > 0 && Math.abs(M) > 0 },
        { name: 'Combined Tension + Bending', ref: 'ISO 22156 §8.5 / IStructE Manual (2025) §6.5', expr: '\\dfrac{\\sigma_{t,0}}{f_{t,0,allow}} + \\dfrac{\\sigma_m}{f_{m,allow}}', r: r_NM_t, active: Pt > 0 && Math.abs(M) > 0 },
    ];

    if (checks.filter(c => c.active).length === 0) {
        throw new Error('No demands provided - enter at least one of $M$, $V$, $P_c$, $P_t$.');
    }
    const active = checks.filter(c => c.active);
    const governing = active.reduce((a, b2) => (b2.r > a.r ? b2 : a));
    const allOk = governing.r <= 1.0;

    // ---------- Calc breakdown table ----------
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
            title: 'Cross-Section Area', sym: 'A', ref: 'Hollow circular tube',
            tex: {
                sym: 'A = \\dfrac{\\pi}{4}\\,(D^{2} - d_i^{2})',
                sub: `A = \\dfrac{\\pi}{4}\\,(${f(sec.D)}^{2} - ${f(sec.di)}^{2})`,
                result: `A = ${f(sec.A, 1)}\\ \\text{mm}^{2}`
            }
        },
        {
            title: 'Second Moment of Area', sym: 'I', ref: 'Hollow circular tube',
            tex: {
                sym: 'I = \\dfrac{\\pi}{64}\\,(D^{4} - d_i^{4})',
                sub: `I = \\dfrac{\\pi}{64}\\,(${f(sec.D)}^{4} - ${f(sec.di)}^{4})`,
                result: `I = ${f(sec.I / 1e4)}\\ \\text{cm}^{4}`
            }
        },
        {
            title: 'Section Modulus', sym: 'S', ref: '$S = 2I/D$',
            tex: {
                sym: 'S = \\dfrac{2I}{D}',
                sub: `S = \\dfrac{2 \\cdot ${fInt(sec.I)}}{${f(sec.D)}}`,
                result: `S = ${f(sec.S / 1e3)}\\ \\text{cm}^{3}`
            }
        },
        {
            title: 'Modification Factors', sym: 'C_R, C_{DF}, C_{DE}, C_T, C_M, C_F',
            ref: 'IStructE Manual (2025) Eq. 3.9 / Eq. 3.10; Appendix A3.2',
            tex: {
                sym: '(C_R,\\,C_{DF},\\,C_{DE},\\,C_T,\\,C_M,\\,C_F)\\ \\text{from Manual Eq.~3.9 \\& 3.10}',
                sub: `\\text{SC ${sc}, ${LD_LABELS[ld].replace('&', '\\&')}};\\ T_s = ${Tsvc.toFixed(0)}^{\\circ}\\text{C};\\ MC_{test}=${mcTest.toFixed(0)}\\%;\\ MC_{svc}=${mcSvc.toFixed(0)}\\%`,
                result: `(${CR.toFixed(2)},\\ ${cdf.toFixed(2)},\\ ${cde.toFixed(2)},\\ ${CT.toFixed(2)},\\ ${CM.toFixed(2)},\\ ${CF.toFixed(2)})`,
                note: (cdfFellBack || cdeFellBack) ? `$C_{DF}/C_{DE}$ for SC 3 are deferred to ISO 22156 §5.6.3 - SC 2 row used as a conservative placeholder.` : null
            }
        },
        {
            title: 'Allowable Bending Stress', sym: 'f_{m,allow}',
            ref: 'IStructE Manual (2025) Eq. 3.9 ($FS_{ax}=2$)',
            tex: {
                sym: 'f_{m,allow} = \\dfrac{f_{m,k}\\,C_R\\,C_{DF}\\,C_T\\,C_M\\,C_F}{FS_{ax}}',
                sub: `f_{m,allow} = \\dfrac{${cdotChain(f(sp.fmk, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2), CM.toFixed(2), CF.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{m,allow} = ${f(fm_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Compressive Stress', sym: 'f_{c,0,allow}',
            ref: 'IStructE Manual (2025) Eq. 3.9 ($FS_{ax}=2$)',
            tex: {
                sym: 'f_{c,0,allow} = \\dfrac{f_{c,0,k}\\,C_R\\,C_{DF}\\,C_T\\,C_M\\,C_F}{FS_{ax}}',
                sub: `f_{c,0,allow} = \\dfrac{${cdotChain(f(sp.fc0k, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2), CM.toFixed(2), CF.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{c,0,allow} = ${f(fc0_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Tensile Stress', sym: 'f_{t,0,allow}',
            ref: 'IStructE Manual (2025) Eq. 3.9 ($FS_{ax}=2$)',
            tex: {
                sym: 'f_{t,0,allow} = \\dfrac{f_{t,0,k}\\,C_R\\,C_{DF}\\,C_T\\,C_M\\,C_F}{FS_{ax}}',
                sub: `f_{t,0,allow} = \\dfrac{${cdotChain(f(sp.ft0k, 1), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2), CM.toFixed(2), CF.toFixed(2))}}{${FS_AXIAL}}`,
                result: `f_{t,0,allow} = ${f(ft0_allow)}\\ \\text{MPa}`
            }
        },
        {
            title: 'Allowable Shear Stress', sym: 'f_{v,allow}',
            ref: 'IStructE Manual (2025) Eq. 3.9 ($FS_{sh}=4$ — splitting)',
            tex: {
                sym: 'f_{v,allow} = \\dfrac{f_{v,k}\\,C_R\\,C_{DF}\\,C_T\\,C_M}{FS_{sh}}',
                sub: `f_{v,allow} = \\dfrac{${cdotChain(f(sp.fvk, 2), CR.toFixed(2), cdf.toFixed(2), CT.toFixed(2), CM.toFixed(2))}}{${FS_SHEAR}}`,
                result: `f_{v,allow} = ${f(fv_allow)}\\ \\text{MPa}`,
                note: '$C_F$ omitted for shear; $FS_{sh}=4$ captures bamboo splitting / cleavage.'
            }
        },
        {
            title: 'Applied Demands (ASD)', sym: 'M,\\ V,\\ P_c,\\ P_t',
            ref: 'User input - governing ASD combination from analysis',
            tex: {
                sym: 'M,\\ V,\\ P_c,\\ P_t\\ \\text{taken from project structural analysis}',
                sub: `M = ${f(M, 3)}\\ \\text{kNm};\\quad V = ${f(V)}\\ \\text{kN}`,
                result: `P_c = ${f(Pc)}\\ \\text{kN};\\quad P_t = ${f(Pt)}\\ \\text{kN}`
            }
        },
        {
            title: 'Bending Resistance', sym: 'M_{allow}',
            ref: 'IStructE Manual (2025) §6.3', ng: r_bend > 1,
            tex: {
                sym: 'M_{allow} = S\\,f_{m,allow}',
                sub: `M_{allow} = ${fInt(sec.S)} \\cdot ${f(fm_allow)}`,
                result: `M_{allow} = ${f(M_allow, 3)}\\ \\text{kNm}`,
                note: `(utilisation = ${f(r_bend, 3)})`
            }
        },
        {
            title: 'Shear Resistance', sym: 'V_{allow}',
            ref: 'IStructE Manual (2025) §6.6 ($FS_{sh}=4$)', ng: r_shear > 1,
            tex: {
                sym: 'V_{allow} = \\dfrac{A\\,f_{v,allow}}{2}\\quad(\\tau_{max}\\approx 2V/A)',
                sub: `V_{allow} = \\dfrac{${f(sec.A, 1)} \\cdot ${f(fv_allow)}}{2}`,
                result: `V_{allow} = ${f(V_allow)}\\ \\text{kN}`,
                note: `(utilisation = ${f(r_shear, 3)})`
            }
        },
        // PATCH 2: explicit derivation for the short-column compression
        // resistance (P_{c,allow,0}) so the *Compression (short)* check has a
        // matching trace in the calc walkthrough, mirroring the tension and
        // bending rows above.
        {
            title: 'Compression Resistance (crushing)', sym: 'P_{c,allow,0}',
            ref: 'IStructE Manual (2025) §6.4', ng: r_comp > 1,
            tex: {
                sym: 'P_{c,allow,0} = n_{culms}\\,A\\,f_{c,0,allow}',
                sub: `P_{c,allow,0} = ${n_culms} \\cdot ${f(sec.A, 1)} \\cdot ${f(fc0_allow)}`,
                result: `P_{c,allow,0} = ${f(Pc_allow_0)}\\ \\text{kN}`,
                note: Pc > 0 ? `(utilisation = ${f(r_comp, 3)})` : '(no compression demand)'
            }
        },
        {
            title: 'Tension Resistance', sym: 'P_{t,allow}',
            ref: 'IStructE Manual (2025) §6.5', ng: r_tens > 1,
            tex: {
                sym: 'P_{t,allow} = n_{culms}\\,A\\,f_{t,0,allow}',
                sub: `P_{t,allow} = ${n_culms} \\cdot ${f(sec.A, 1)} \\cdot ${f(ft0_allow)}`,
                result: `P_{t,allow} = ${f(Pt_allow)}\\ \\text{kN}`,
                note: Pt > 0 ? `(utilisation = ${f(r_tens, 3)})` : '(no tension demand)'
            }
        },
        {
            title: 'Bow Reduction Factor', sym: 'C_{bow}',
            ref: 'IStructE Manual (2025) §6.4.2 (Eq. 6.4)',
            tex: {
                sym: 'C_{bow} = 1 - \\dfrac{b_0}{0.02}',
                sub: `C_{bow} = 1 - \\dfrac{${f(bow, 4)}}{0.02}`,
                result: `C_{bow} = ${f(C_bow, 3)}`
            }
        },
        {
            title: 'Char. Crushing Capacity', sym: 'P_{c,k}',
            ref: 'IStructE Manual (2025) §6.4.2 (Eq. 6.2)',
            tex: {
                sym: 'P_{c,k} = f_{c,0,k}\\,A\\,n_{culms}',
                sub: `P_{c,k} = ${f(sp.fc0k, 1)} \\cdot ${f(sec.A, 1)} \\cdot ${n_culms}`,
                result: `P_{c,k} = ${f(P_ck)}\\ \\text{kN}`
            }
        },
        {
            title: 'Characteristic Modulus', sym: 'E_k',
            ref: 'IStructE Manual (2025) Table 4.4 (footnote b)',
            tex: {
                sym: 'E_k = \\begin{cases} 15\\ \\text{GPa} & D/t \\geq 10 \\\\ 10\\ \\text{GPa} & D/t < 10 \\end{cases}',
                sub: `D/t = ${f(sec.Dt, 2)}`,
                result: `E_k = ${fInt(sp.Ek)}\\ \\text{MPa}`,
                note: ekAutoPicked ? null : 'User-entered value (custom species).'
            }
        },
        {
            title: 'Design Modulus', sym: 'E_d',
            ref: 'IStructE Manual (2025) Eq. 3.10',
            tex: {
                sym: 'E_d = E_k \\cdot C_{DE} \\cdot C_T',
                sub: `E_d = ${cdotChain(fInt(sp.Ek), cde.toFixed(2), CT.toFixed(2))}`,
                result: `E_d = ${fInt(E_d)}\\ \\text{MPa}`,
                note: (cdfFellBack || cdeFellBack) ? `$C_{DF}/C_{DE}$ for SC 3 are deferred to ISO 22156 §5.6.3 - SC 2 row used as a conservative placeholder.` : null
            }
        },
        {
            title: 'Char. Euler Capacity', sym: 'P_{e,k}',
            ref: 'IStructE Manual (2025) §6.4.2 (Eq. 6.3)',
            tex: {
                sym: 'P_{e,k} = \\dfrac{n_{culms}\\,\\pi^{2}\\,E_d\\,I\\,C_{bow}}{(KL)^{2}}',
                sub: `P_{e,k} = \\dfrac{${n_culms}\\,\\pi^{2} \\cdot\\allowbreak ${fInt(E_d)} \\cdot\\allowbreak ${fInt(sec.I)} \\cdot\\allowbreak ${f(C_bow, 3)}}{${fInt(KL)}^{2}}`,
                result: `P_{e,k} = ${f(P_ek)}\\ \\text{kN}`
            }
        },
        {
            title: 'Char. Column Capacity (Ylinen)', sym: 'N_{cr,k}',
            ref: 'IStructE Manual (2025) §6.4.2 (Eq. 6.1; Appendix A6.2)',
            tex: {
                sym: 'N_{cr,k} = s - \\sqrt{s^{2} - \\dfrac{P_{c,k}\\,P_{e,k}}{c}},\\ \\ s=\\dfrac{P_{c,k}+P_{e,k}}{2c}',
                sub: `c = ${C_YLINEN};\\ P_{c,k} = ${f(P_ck)};\\ P_{e,k} = ${f(P_ek)}`,
                result: `N_{cr,k} = ${f(N_cr_k)}\\ \\text{kN}`,
                note: 'Ylinen empirical interaction (Manual Appendix A6.2).'
            }
        },
        {
            title: 'Compression Resistance (buckling)', sym: 'P_{c,allow}',
            ref: 'IStructE Manual (2025) §6.4.2 (Eq. 6.5; $FS_M=2$)', ng: r_buck > 1,
            tex: {
                sym: 'P_{c,allow} = \\dfrac{N_{cr,k}\\,C_R\\,C_T\\,C_{DF}}{FS_M}',
                sub: `P_{c,allow} = \\dfrac{${cdotChain(f(N_cr_k), CR.toFixed(2), CT.toFixed(2), cdf.toFixed(2))}}{${FS_M}}`,
                result: `P_{c,allow} = ${f(Pc_allow)}\\ \\text{kN}`,
                note: Pc > 0 ? `(utilisation = ${f(r_buck, 3)})` : '(no compression demand)'
            }
        },
    ];

    // Conditional rows — combined compression + bending block.
    if (Pc > 0 && Math.abs(M) > 0 && e_axial > 0) {
        calc.push({
            title: 'Effective Moment (incl. eccentricity)', sym: 'M_d',
            ref: 'IStructE Manual (2025) §6.8.1',
            tex: {
                sym: 'M_d = M + P_c\\,\\dfrac{e}{1000}\\quad(e\\ \\text{in mm})',
                sub: `M_d = ${f(M, 3)} + ${f(Pc)}\\cdot\\dfrac{${e_axial.toFixed(1)}}{1000}`,
                result: `M_d = ${f(M_d_eff, 3)}\\ \\text{kNm}`
            }
        });
    }

    if (Pc > 0 && Math.abs(M) > 0) {
        calc.push({
            title: 'Combined-action Magnifier', sym: 'B',
            ref: 'IStructE Manual (2025) §6.8 (Eq. 6.11)',
            tex: {
                sym: 'B = \\dfrac{1}{1 - P_c / N_{cr,k}}',
                sub: `B = \\dfrac{1}{1 - ${f(Pc)} / ${f(N_cr_k)}}`,
                result: `B = ${f(B_amp, 3)}`,
                note: 'Eq. 6.11a $P\\text{-}\\Delta$ amplifier; denominator uses $N_{cr,k}$ (characteristic Ylinen result, NOT the allowable $P_{c,allow}$).'
            },
        });
        calc.push({
            title: 'Combined N(c) + M Interaction',
            ref: 'IStructE Manual (2025) §6.8 (Eq. 6.10)', ng: r_NM_c > 1,
            tex: {
                sym: '\\dfrac{P_c}{P_{c,allow}} + B\\cdot\\dfrac{M_d}{M_{allow}} \\leq 1.0',
                sub: `\\dfrac{${f(Pc)}}{${f(Pc_allow)}} + ${f(B_amp, 3)}\\cdot\\dfrac{${f(M_d_eff, 3)}}{${f(M_allow, 3)}}`,
                result: `r_{NM,c} = ${f(r_NM_c, 3)}`
            },
        });
    }

    if (Pt > 0 && Math.abs(M) > 0) {
        calc.push({
            title: 'Combined N(t) + M Interaction',
            ref: 'ISO 22156 §8.5 / IStructE Manual (2025) §6.5', ng: r_NM_t > 1,
            tex: {
                sym: '\\dfrac{\\sigma_{t,0}}{f_{t,0,allow}} + \\dfrac{\\sigma_m}{f_{m,allow}} \\leq 1.0',
                sub: `\\dfrac{${f(sigma_t)}}{${f(ft0_allow)}} + \\dfrac{${f(sigma_m)}}{${f(fm_allow)}}`,
                result: `r_{NM,t} = ${f(r_NM_t, 3)}`
            },
        });
    }

    // ---------- Applied props ----------
    const appliedProps = {
        speciesName: sp.name,
        fmk: sp.fmk, fc0k: sp.fc0k, ft0k: sp.ft0k, fvk: sp.fvk,
        Ek: sp.Ek,
    };

    return {
        inputs: {
            D: sec.D, t: sec.t, di: sec.di, Ln,
            alphaE, bow, C_bow,
            A: sec.A, I: sec.I, S: sec.S, Dt: sec.Dt,
            species: sp.name, sp,
            sc, ld, cdf, cde, cdeFellBack, CR, CT, CM, CF, Tsvc, mcTest, mcService: mcSvc,
            Ek: sp.Ek, E_d, ekAutoPicked,
            fm_allow, fc0_allow, ft0_allow, fv_allow,
            L: Lm, K, KL, n_culms, e_axial,
            M, V, Pc, Pt, M_d_eff, B_amp,
            M_allow, V_allow, Pt_allow, Pc_allow, Pc_allow_0,
            P_ck, P_ek, N_cr_k,
            maxR: governing.r, governing: governing.name,
            classRows, forcesRows, resistRows,
            checks: checks.map(c => ({ name: c.name, ref: c.ref, expr: c.expr, r: c.r, ok: c.r <= 1.0, active: c.active })),
        },
        calc,
        propsRows,
        appliedProps,
        caption: `Ø ${sec.D.toFixed(0)} × ${sec.t.toFixed(1)} (mm)`,
        verdict: {
            ok: allOk,
            util: governing.r * 100,
            governing: governing.name,
            badge: allOk ? 'OK' : 'FAIL',
            headline: allOk ? 'Culm adequate' : 'Culm overstressed',
        },
    };
}


// ---------- export-latex ----------
// Bamboo Culm Design — ASD per IStructE Manual (2025), member-level only.
// Uses the math from the calculation results so we don't duplicate species data or formulas.
//
// NOTE: The scope/disclaimer panel lives ONLY in the on-screen UI
// (see SCOPE_NOTE in index.html). It is intentionally absent from the LaTeX
// export — engineers signing the printed calc package are expected to add
// their own scope/limitations boilerplate via the project header.




function buildSectionTikz(i) {
    const { D, t, di } = i;
    const s = 45 / D;                  // mm per tikz-unit; tuned for 0.40\textwidth pane
    const Ro = D / 2, Ri = di / 2;
    const lw = '0.40';
    const padXY = 14 / s;              // tikz units (≈14mm of dashed-line padding)
    const ff = (v, d = 2) => Number(v).toFixed(d);
    const a = Math.PI / 4, cosA = Math.cos(a), sinA = Math.sin(a);

    return [
        `\\begin{tikzpicture}[x=${s.toFixed(4)}mm, y=${s.toFixed(4)}mm, line cap=round, line join=round, font=\\scriptsize]`,
        `  \\draw[gray!45, dashed, line width=0.3pt] (${ff(-Ro - padXY)}, 0) -- (${ff(Ro + padXY)}, 0);`,
        `  \\draw[gray!45, dashed, line width=0.3pt] (0, ${ff(-Ro - padXY)}) -- (0, ${ff(Ro + padXY)});`,
        `  \\fill[gray!60] (0, 0) circle (0.4mm);`,
        `  \\filldraw[line width=${lw}mm, color=black!80, fill=olive!20, even odd rule]`,
        `    (0, 0) circle (${ff(Ro)}) (0, 0) circle (${ff(Ri)});`,
        `  \\draw[<->, gray!70, line width=0.3pt] (${ff(-Ro)}, ${ff(Ro + 8 / s)}) -- (${ff(Ro)}, ${ff(Ro + 8 / s)});`,
        `  \\node[fill=white, inner sep=1pt, text=gray!75!black] at (0, ${ff(Ro + 8 / s + 3 / s)}) {$D{=}${ff(D, 1)}$};`,
        `  \\draw[<->, gray!70, line width=0.3pt] (${ff(-Ri)}, ${ff(-Ro - 8 / s)}) -- (${ff(Ri)}, ${ff(-Ro - 8 / s)});`,
        `  \\node[fill=white, inner sep=1pt, text=gray!75!black] at (0, ${ff(-Ro - 8 / s - 3 / s)}) {$d_i{=}${ff(di, 1)}$};`,
        `  \\draw[gray!70, line width=0.3pt] (${ff(Ri * cosA)}, ${ff(Ri * sinA)}) -- (${ff((Ro + 14 / s) * cosA)}, ${ff((Ro + 14 / s) * sinA)});`,
        `  \\node[fill=white, inner sep=1pt, text=gray!75!black] at (${ff((Ro + 18 / s) * cosA)}, ${ff((Ro + 18 / s) * sinA)}) {$t{=}${ff(t, 1)}$};`,
        `  \\node[text=gray!55, font=\\tiny] at (${ff(Ro + padXY - 1)}, ${ff(2 / s)}) {$y$};`,
        `  \\node[text=gray!55, font=\\tiny] at (${ff(2 / s)}, ${ff(-Ro - padXY + 1)}) {$z$};`,
        `\\end{tikzpicture}`,
    ].join('\n');
}

function buildLatex(snapshot, hdr) {
    const i = snapshot.inputs;
    const today = new Date().toISOString().slice(0, 10);
    const company = hdr.company || 'Company Name';
    const subtitle = hdr.subtitle || 'Additional Info';
    const job = hdr.job || '-';
    const madeBy = hdr.madeBy || '-';
    const checked = hdr.checked || '-';
    const date = hdr.date || today;
    const project = hdr.project || 'Project Title';
    const component = hdr.component || `Bamboo culm \\O ${i.D.toFixed(0)}x${i.t.toFixed(1)}, ${i.species}`;

    // Map the raw `species` key from the form to the on-screen <select> labels.
    // index.html shows: "from Manual Tbl 4.4" / "Custom (enter values)".
    // We render the option label here (not the resolved species name) so the
    // exported "Strength & Stiffness Data" row matches the page exactly. The full species
    // descriptor still appears in the TikZ caption.
    const strengthDataLabel = hdr.speciesKey === 'custom'
        ? 'Custom (enter values)'
        : 'from Manual Tbl 4.4';

    const loadDurationLabel = LD_LABELS[i.ld] || i.ld;


    const esc = (s) => String(s)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/([&%$#_{}])/g, '\\$1')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
    const escTextCell = (s) => esc(String(s).replace(/[\u2013\u2014]/g, '-'));

    // Render a note that may contain inline math wrapped in $...$.
    // Prose segments are TeX-escaped via escTextCell; math segments are passed
    // through verbatim so subscripts/Greek/etc. typeset correctly.
    // Markdown-style **bold** in prose is converted to \textbf{...} so the
    // exported LaTeX matches what the on-screen renderer shows.
    const escNote = (s) => {
        if (s == null) return '';
        const str = String(s);
        if (!str) return '';
        const parts = str.split(/\$([^$]*)\$/g);
        const boldify = (txt) => escTextCell(txt)
            .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
        if (parts.length % 2 === 0) {
            return boldify(str);
        }
        return parts
            .map((seg, idx) => (idx % 2 === 0 ? boldify(seg) : `$${seg}$`))
            .join('');
    };

    // Insert thin-space thousands separators in long integers so they don't break ugly across lines.
    const numFmt = (s) => String(s).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1\\,');

    // Tightened: keep "IStructE Manual (2025)" intact; only break after ISO 22156 prefix.
    // Mirrors escNote(): splits on $...$ so any math wrapped in dollar-signs passes through
    // to LaTeX verbatim, while prose is TeX-escaped (with the existing \S and ISO-22156
    // line-break rules applied).
    const refFmt = (r) => {
        const str = String(r ?? '').replace(/[\u2013\u2014]/g, '-');
        const proseEsc = (txt) => escTextCell(txt)
            .replace(/§/g, '\\S\\,')
            .replace(/(ISO\s+22156(?:\s*\\S\\,[\d.]+)?)\s+\//, '$1\\newline /');
        const parts = str.split(/\$([^$]*)\$/g);
        // Unbalanced $ → safe fallback: treat the whole string as prose.
        if (parts.length % 2 === 0) return proseEsc(str);
        return parts
            .map((seg, i) => (i % 2 === 0 ? proseEsc(seg) : `$${seg}$`))
            .join('');
    };

    const splitSym = (sym) => {
        if (sym.includes(';\\quad ')) {
            const parts = sym.split(';\\quad ');
            return parts.map((p, idx) => idx < parts.length - 1
                ? `$\\displaystyle ${p};$`
                : `$\\displaystyle ${p}$`).join('\\allowbreak\\quad ');
        }
        return `$\\displaystyle ${sym}$`;
    };

    const verdictColor = i.maxR <= 1.0 ? 'okgreen' : 'failred';
    const verdictText = i.maxR <= 1.0 ? 'Culm adequate' : 'Culm overstressed';
    const utilStr = (i.maxR * 100).toFixed(2);

    const out = [];

    // ---------------- Preamble ----------------
    out.push(
        '% bamboo-culm-sizer. v1.0.0 - 2026 by J.Oduru.',
        `% ${date}`,
        '\\documentclass[11pt,a4paper,portrait]{article}',
        '',
        '\\usepackage[a4paper,portrait,margin=15mm,top=18mm,bottom=16mm]{geometry}',
        '\\usepackage{amsmath,amssymb}',
        '\\usepackage{array,tabularx,longtable,booktabs}',
        '\\usepackage{xltabular}',
        '\\usepackage{lmodern}',
        '\\usepackage[T1]{fontenc}',
        '\\usepackage{microtype}',
        '\\usepackage[table]{xcolor}',
        '\\usepackage{graphicx,tikz}',
        '\\usepackage{textcomp}',
        '\\usepackage{ragged2e}',
        '\\usepackage{multirow}',
        '\\usepackage{enumitem}',
        '',
        '\\setlength{\\parindent}{0pt}',
        '\\setlength{\\parskip}{2pt}',
        '\\renewcommand{\\arraystretch}{1.20}',
        '\\setlength{\\emergencystretch}{3em}',
        '\\sloppy',
        '',
        '% colours',
        '\\definecolor{headband}{HTML}{1F3A5F}',
        '\\definecolor{headtext}{HTML}{FFFFFF}',
        '\\definecolor{okgreen}{HTML}{2E7D32}',
        '\\definecolor{failred}{HTML}{B71C1C}',
        '',
        '% status macros (no markdown asterisks)',
        '\\newcommand{\\OK}{\\textcolor{okgreen}{\\textbf{OK}}}',
        '\\newcommand{\\FAIL}{\\textcolor{failred}{\\textbf{FAIL}}}',
        '\\newcommand{\\NA}{\\textcolor{gray}{\\textbf{N/A}}}',
        '',
        '% column types for the calc xltabular',
        '\\newcolumntype{R}{>{\\RaggedRight\\arraybackslash\\footnotesize}p{0.16\\textwidth}}',
        '\\newcolumntype{C}{>{\\RaggedRight\\arraybackslash\\footnotesize}X}',
        '\\newcolumntype{O}{>{\\RaggedRight\\arraybackslash\\footnotesize}p{0.30\\textwidth}}',
        '',
        '\\newcommand{\\projectheader}{%',
        '\\noindent',
        '\\begin{tabularx}{\\textwidth}{|>{\\RaggedRight\\arraybackslash}p{0.40\\textwidth}',
        '                              |>{\\RaggedRight\\arraybackslash}X',
        '                              |>{\\RaggedRight\\arraybackslash}X|}',
        '\\hline',
        `\\multirow{2}{*}{\\parbox[c]{0.40\\textwidth}{\\textbf{\\large ${esc(company)}}\\\\[1pt]\\small ${esc(subtitle)}}}`,
        `& Job No.: \\textbf{${esc(job)}} & Date: ${esc(date)} \\\\\\cline{2-3}`,
        `& Calcs by: \\textbf{${esc(madeBy)}} & Checked by: ${esc(checked)} \\\\`,
        '\\hline',
        `\\multicolumn{3}{|>{\\RaggedRight\\arraybackslash}p{0.97\\textwidth}|}{Project: \\textbf{${esc(project)}}\\quad Component: \\textbf{${esc(component)}}} \\\\`,
        '\\hline',
        '\\end{tabularx}\\par\\vspace{4pt}',
        '}',
        '',
        '\\newcommand{\\calcheader}{%',
        '\\rowcolor{headband}',
        '{\\color{headtext}\\textbf{REF}} &',
        '{\\color{headtext}\\textbf{CALCULATION}} &',
        '{\\color{headtext}\\textbf{OUTPUT}} \\\\',
        '\\hline',
        '}',
        '',
        '\\newcommand{\\panelhead}[1]{\\textbf{\\large #1}\\par\\vspace{2pt}}',
        '',
        '\\begin{document}',
        '',
        '\\projectheader',
        ''
    );

    // ---------------- PAGE 1: geometry + design parameters + verdict ----------------
    out.push(
        '\\noindent',
        '\\begin{minipage}[t]{0.40\\textwidth}',
        '\\panelhead{Section geometry}',
        '\\centering',
        buildSectionTikz(i),
        '\\par\\vspace{3pt}',
        `{\\footnotesize Hollow culm $\\varnothing\\,${i.D.toFixed(0)}\\times ${i.t.toFixed(1)}$ (mm).}`,
        '\\end{minipage}\\hfill',
        '\\begin{minipage}[t]{0.58\\textwidth}',
        '\\panelhead{Design parameters}',
        '\\footnotesize',
        '\\begin{tabularx}{\\linewidth}{@{}>{\\RaggedRight\\arraybackslash}p{0.46\\linewidth} >{\\centering\\arraybackslash}p{0.16\\linewidth} >{\\RaggedRight\\arraybackslash}X@{}}',
        '\\toprule',
        'Parameter & Symbol & Value \\\\',
        '\\midrule',
        `Outer Diameter             & $D$            & ${i.D.toFixed(2)}\\,mm \\\\`,
        `Wall Thickness             & $t$            & ${i.t.toFixed(2)}\\,mm \\\\`,
        `Inner Diameter             & $d_i$          & ${i.di.toFixed(2)}\\,mm \\\\`,
        `Internode Length           & $L_n$          & ${i.Ln.toFixed(0)}\\,mm \\\\`,
        `Strength \\& Stiffness Data & --             & ${esc(strengthDataLabel)} \\\\`,
        `$f_{m,k}$                  & --             & ${i.sp.fmk.toFixed(1)}\\,MPa \\\\`,
        `$f_{c,0,k}$                & --             & ${i.sp.fc0k.toFixed(1)}\\,MPa \\\\`,
        `$f_{t,0,k}$                & --             & ${i.sp.ft0k.toFixed(1)}\\,MPa \\\\`,
        `$f_{v,k}$                  & --             & ${i.sp.fvk.toFixed(2)}\\,MPa \\\\`,
        `$E_k$                      & --             & ${numFmt(i.Ek)}\\,\\text{MPa} \\\\`,
        `$E_d$                      & --             & ${numFmt(i.E_d)}\\,\\text{MPa} \\\\`,
        `Service Class              & SC             & ${i.sc} \\\\`,
        `Load Duration              & --             & ${esc(loadDurationLabel)} \\\\`,
        `Test MC                    & $MC_{test}$    & ${i.mcTest.toFixed(0)}\\,\\% \\\\`,
        `Service MC                 & $MC_{svc}$     & ${i.mcService.toFixed(0)}\\,\\% \\\\`,
        `$C_R$ (redundancy)         & --             & ${i.CR.toFixed(2)} \\\\`,
        `$C_{DF}$ (load duration)   & --             & ${i.cdf.toFixed(2)} \\\\`,
        `$C_{DE}$ (load duration, modulus)    & --             & ${i.cde.toFixed(2)}${i.cdeFellBack ? ' (SC 2)' : ''} \\\\`,
        `$C_T$ (temperature)        & --             & ${i.CT.toFixed(2)} \\\\`,
        `$C_M$ (moisture)           & --             & ${i.CM.toFixed(2)} \\\\`,
        `$C_F$ (size)               & --             & ${i.CF.toFixed(2)} \\\\`,
        `$FS_{ax}/FS_{sh}/FS_M$     & --             & 2 / 4 / 2 \\\\`,
        `Service Temperature        & $T_s$          & ${i.Tsvc.toFixed(0)}\\,\\textdegree C \\\\`,
        `Member Length              & $L$            & ${i.L.toFixed(2)}\\,m \\\\`,
        `Eff. Length Factor         & $K$            & ${i.K.toFixed(2)} \\\\`,
        `Effective Length           & $KL$           & ${i.KL.toFixed(0)}\\,mm \\\\`,
        `Number of Culms            & $n_{culms}$    & ${i.n_culms} \\\\`,
        `Axial Eccentricity         & $e$            & ${i.e_axial.toFixed(1)}\\,mm \\\\`,
        `Bending Moment             & $M$            & ${i.M.toFixed(3)}\\,kNm \\\\`,
        `Shear                      & $V$            & ${i.V.toFixed(2)}\\,kN \\\\`,
        `Compression                & $P_c$          & ${i.Pc.toFixed(2)}\\,kN \\\\`,
        `Tension                    & $P_t$          & ${i.Pt.toFixed(2)}\\,kN \\\\`,
        '\\bottomrule',
        '\\end{tabularx}',
        '\\end{minipage}',
        '\\par\\vspace{10pt}',
        ''
    );

    // Verdict band (full width, fills the bottom of page 1 cleanly now that
    // Section properties has moved to page 2).
    out.push(
        `\\noindent\\fcolorbox{${verdictColor}}{${verdictColor}!8}{%`,
        '\\begin{minipage}{\\dimexpr\\textwidth-2\\fboxsep-2\\fboxrule\\relax}',
        '\\centering',
        `{\\Large\\bfseries\\color{${verdictColor}}${verdictText}}\\par`,
        '\\vspace{3pt}',
        `{\\large Max utilisation: \\textbf{${utilStr}\\,\\%}}\\par`,
        '\\vspace{2pt}',
        `{\\footnotesize Governing: ${esc(i.governing)}}`,
        '\\vspace{2pt}',
        '\\end{minipage}}',
        '',
        '\\clearpage',
        ''
    );

    // ---------------- PAGE 2: properties (left) + forces/resistance (right) ----------------
    //
    // 2+1 stacked layout. Properties is the tall left column; Forces and
    // Resistance share the right column (Forces on top, Resistance below).
    // Heights balance well: ~13 property rows ≈ ~6 forces + ~8 resistance.

    out.push('\\noindent');

    // -- LEFT: Section & material properties (full-height column)
    out.push(
        '\\begin{minipage}[t]{0.48\\textwidth}',
        '\\panelhead{Section \\& material properties}',
        '\\footnotesize',
        '\\begin{tabularx}{\\linewidth}{@{}>{\\RaggedRight\\arraybackslash}X >{\\centering\\arraybackslash}p{0.22\\linewidth} >{\\raggedleft\\arraybackslash}p{0.30\\linewidth}@{}}',
        '\\toprule',
        'Quantity & Symbol & Value \\\\',
        '\\midrule',
        `Cross-Section Area             & $A$               & ${i.A.toFixed(2)}\\,mm$^2$ \\\\`,
        `Second Moment of Area          & $I$               & ${(i.I / 1e4).toFixed(2)}\\,cm$^4$ \\\\`,
        `Section Modulus                & $S$               & ${(i.S / 1e3).toFixed(2)}\\,cm$^3$ \\\\`,
        `D/t Ratio                      & $D/t$             & ${i.Dt.toFixed(2)} \\\\`,
        `Bow                            & $b_0$             & ${i.bow.toFixed(3)} \\\\`,
        `Bow Reduction Factor           & $C_{bow}$         & ${i.C_bow.toFixed(3)} \\\\`,
        `External Taper                 & $\\alpha_e$       & ${i.alphaE.toFixed(3)} \\\\`,
        `Allowable Bending Stress       & $f_{m,allow}$     & ${i.fm_allow.toFixed(2)}\\,MPa \\\\`,
        `Allowable Compressive Stress   & $f_{c,0,allow}$   & ${i.fc0_allow.toFixed(2)}\\,MPa \\\\`,
        `Allowable Tensile Stress       & $f_{t,0,allow}$   & ${i.ft0_allow.toFixed(2)}\\,MPa \\\\`,
        `Allowable Shear Stress         & $f_{v,allow}$     & ${i.fv_allow.toFixed(2)}\\,MPa \\\\`,
        '\\bottomrule',
        '\\end{tabularx}',
        '\\end{minipage}\\hfill'
    );

    // -- RIGHT: Forces stacked above Resistance, sharing one minipage so they
    //    align flush right and inherit the same column width.
    out.push(
        '\\begin{minipage}[t]{0.48\\textwidth}',
        '\\panelhead{Design forces}',
        '\\footnotesize',
        '\\begin{tabularx}{\\linewidth}{@{}>{\\RaggedRight\\arraybackslash}X >{\\centering\\arraybackslash}p{0.22\\linewidth} >{\\raggedleft\\arraybackslash}p{0.30\\linewidth}@{}}',
        '\\toprule',
        'Quantity & Symbol & Value \\\\',
        '\\midrule'
    );
    for (const r of i.forcesRows) out.push(`${escTextCell(r.name)} & $${r.sym}$ & ${escTextCell(r.val)} \\\\`);
    out.push(
        '\\bottomrule',
        '\\end{tabularx}',
        '',
        '\\vspace{14pt}',
        '',
        '\\panelhead{Resistance values}',
        '\\footnotesize',
        '\\begin{tabularx}{\\linewidth}{@{}>{\\RaggedRight\\arraybackslash}X >{\\centering\\arraybackslash}p{0.26\\linewidth} >{\\raggedleft\\arraybackslash}p{0.26\\linewidth}@{}}',
        '\\toprule',
        'Quantity & Symbol & Value \\\\',
        '\\midrule'
    );
    for (const r of i.resistRows) out.push(`${escTextCell(r.name)} & $${r.sym}$ & ${escTextCell(r.val)} \\\\`);
    out.push(
        '\\bottomrule',
        '\\end{tabularx}',
        '\\end{minipage}',
        '',
        '\\clearpage',
        ''
    );

    // ---------------- PAGE 3: section classification + verification checks ----------------
    //
    // Both tables are full-width with long reference/expression columns, so
    // they're given their own page. Classification on top (shorter, fixed
    // 7 rows), checks below (taller, with multi-line cells for refs).

    out.push(
        '{\\renewcommand{\\arraystretch}{1.18}',
        '\\panelhead{Section classification}',
        '\\footnotesize',
        '\\begin{tabularx}{\\textwidth}{@{}>{\\RaggedRight\\arraybackslash}p{0.18\\textwidth}',
        '                                  >{\\centering\\arraybackslash}p{0.06\\textwidth}',
        '                                  >{\\centering\\arraybackslash}p{0.07\\textwidth}',
        '                                  >{\\centering\\arraybackslash}p{0.15\\textwidth}',
        '                                  >{\\RaggedRight\\arraybackslash}X',
        '                                  >{\\centering\\arraybackslash}p{0.06\\textwidth}@{}}',
        '\\toprule',
        'Element / Quantity & Ratio & Value & Limit & Reference & Status \\\\',
        '\\midrule'
    );
    for (const c of i.classRows) {
        const status = c.ok ? '\\OK' : '\\FAIL';
        out.push(`${escTextCell(c.name)} & $${c.sym}$ & ${c.val.toFixed(2)} & $${c.lim}$ & ${refFmt(c.ref)} & ${status} \\\\`);
    }
    out.push('\\bottomrule', '\\end{tabularx}', '\\par\\vspace{14pt}', '');

    out.push(
        '\\panelhead{Verification checks}',
        '\\footnotesize',
        '\\begin{tabularx}{\\textwidth}{@{}>{\\RaggedRight\\arraybackslash}p{0.30\\textwidth}',
        '                                 >{\\RaggedRight\\arraybackslash}X',
        '                                 >{\\centering\\arraybackslash}p{0.07\\textwidth}',
        '                                 >{\\centering\\arraybackslash}p{0.08\\textwidth}@{}}',
        '\\toprule',
        'Check & Expression & Ratio & Status \\\\',
        '\\midrule'
    );
    for (const c of i.checks) {
        const nameCell = `\\textbf{${escTextCell(c.name)}}\\par{\\scriptsize ${refFmt(c.ref)}}`;
        if (!c.active) { out.push(`${nameCell} & $${c.expr}$ & - & \\NA \\\\`); continue; }
        const status = c.ok ? '\\OK' : '\\FAIL';
        out.push(`${nameCell} & $${c.expr}$ & ${c.r.toFixed(3)} & ${status} \\\\`);
    }
    out.push('\\bottomrule', '\\end{tabularx}', '}% end page-3 group', '');

    // ---------------- Pages 3+: calc walkthrough ----------------
    out.push(
        '\\clearpage',
        '',
        '{\\setlength{\\tabcolsep}{6pt}%',
        '\\renewcommand{\\arraystretch}{1.35}%',
        '',
        '\\begin{xltabular}{\\textwidth}{|R|C|O|}',
        '\\hline \\calcheader \\endfirsthead',
        '\\hline \\calcheader \\endhead',
        '\\hline \\multicolumn{3}{r}{\\footnotesize continued on next page}\\\\ \\endfoot',
        '\\hline \\endlastfoot',
        ''
    );

    const buildOut = (c) => {
        const parts = c.tex.result.split(' = ').map(p => p.trim()).filter(Boolean).map(numFmt);
        const lines = parts.map((p, idx) => idx < parts.length - 1 ? `$${p} =$` : `$${p}$`);
        if (c.tex.note) lines.push(`{\\scriptsize ${escNote(c.tex.note)}}`);
        if (c.ng) lines.push('\\FAIL');
        return lines.join('\\par ');
    };

    for (const c of snapshot.calc) {
        const titleText = escTextCell(c.title);
        out.push(
            `% --- ${c.title} ---`,
            `${refFmt(c.ref)} &`,
            `\\textbf{${titleText}}${c.sym ? ' $' + c.sym + '$' : ''}\\par`,
            `${splitSym(c.tex.sym)}\\par`,
            `$${numFmt(c.tex.sub)}$ &`,
            `${buildOut(c)} \\\\ \\hline`,
            ''
        );
    }
    out.push('\\end{xltabular}', '}% end calc-table padding group', '', '\\end{document}');
    return out.join('\n');
}



    global.BAMBOO_CALC = {
        runCalculation: runCalculation,
        buildLatex: buildLatex,
        LD_LABELS: typeof LD_LABELS !== 'undefined' ? LD_LABELS : {}
    };
})(window);
