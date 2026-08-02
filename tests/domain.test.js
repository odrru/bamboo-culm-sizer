const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    buildPicker,
    calculateModificationFactors,
    runCalculation,
    shapeFor,
} = require("../assets/calc.js");
const {
    buildPrintDocumentTitle,
    formatLocalDateForInput,
} = require("../assets/app.js");

const defaultInputs = {
    company: "",
    reportTitle: "",
    job: "",
    madeBy: "",
    checked: "",
    date: "",
    project: "",
    component: "",
    D: "60",
    t: "15",
    bow: "0.01",
    species: "manual_scheme",
    fmk: "40",
    fc0k: "35",
    ft0k: "40",
    fvk: "3",
    Ek_mean: "10000",
    sc: "2",
    ld: "medium",
    crClass: "standard",
    Tsvc: "25",
    L: "1.5",
    K: "1.10",
    n_culms: "7",
    bundle_grid: "",
    e_axial: "0",
    M: "0.9",
    V: "0.5",
    Pc: "5.5",
    Pt: "9.5",
};

test("bundle picker and shapes match Pro", () => {
    assert.deepEqual(buildPicker(12), [1, 2, 3, 4, 6, 7, 8, 9, 10, 12]);
    assert.deepEqual(shapeFor(1, 80), {
        type: "single",
        culms: 1,
        overallDiameter: 80,
    });
    assert.deepEqual(shapeFor(7, 80), {
        type: "circular",
        rings: 1,
        overallDiameter: 240,
    });
    assert.deepEqual(shapeFor(12, 80), {
        type: "rectangular",
        options: [
            { grid: "3x4", width: 240, depth: 320, ratio: 4 / 3 },
            { grid: "2x6", width: 160, depth: 480, ratio: 3 },
        ],
    });
});

test("default calculation matches the Pro verdict and checks", () => {
    const snapshot = runCalculation(defaultInputs);

    assert.deepEqual(snapshot.verdict, {
        badge: "OK",
        governing: "Combined Compression + Bending",
        ok: true,
        util: snapshot.inputs.maxR * 100,
    });
    assert.equal(snapshot.caption, "\u00D8 60 \u00D7 15.0 (mm)");
    assert.equal(Number(snapshot.inputs.maxR.toFixed(6)), 0.76883);

    const checks = Object.fromEntries(
        snapshot.inputs.checks.map((check) => [check.name, Number(check.r.toFixed(6))]),
    );
    assert.equal(checks.Bending, 0.497481);
    assert.equal(checks.Shear, 0.138189);
    assert.equal(checks["Compression (crushing)"], 0.032573);
    assert.equal(checks.Tension, 0.04923);
    assert.equal(checks["Compression (buckling)"], 0.230975);
    assert.equal(checks["Combined Compression + Bending"], 0.76883);
    assert.equal(checks["Combined Tension + Bending"], 0.546711);
});

test("bundle scaling, tension eccentricity, and SC3 fallbacks match Pro behavior", () => {
    const singleShear = runCalculation({
        ...defaultInputs,
        n_culms: "1",
        M: "0",
        V: "0.5",
        Pc: "0",
        Pt: "0",
    });
    const sevenCulmShear = runCalculation({
        ...defaultInputs,
        n_culms: "7",
        M: "0",
        V: "0.5",
        Pc: "0",
        Pt: "0",
    });
    assert.equal(
        Number((sevenCulmShear.inputs.V_allow / singleShear.inputs.V_allow).toFixed(6)),
        7,
    );

    const concentricTension = runCalculation({
        ...defaultInputs,
        Pc: "0",
        e_axial: "0",
    });
    const eccentricTension = runCalculation({
        ...defaultInputs,
        Pc: "0",
        e_axial: "20",
    });
    assert.equal(
        Number(eccentricTension.inputs.M_d_t_eff.toFixed(6)),
        Number((0.9 + 9.5 * 0.02).toFixed(6)),
    );
    assert.ok(eccentricTension.inputs.maxR > concentricTension.inputs.maxR);

    const factors = calculateModificationFactors({
        sc: "3",
        ld: "medium",
        crClass: "standard",
        Tsvc: "25",
        bow: "0.01",
    });
    assert.equal(factors.cdf, 0.65);
    assert.equal(factors.cde, 0.95);
    assert.equal(factors.cdfFellBack, true);
    assert.equal(factors.cdeFellBack, true);
});

test("calculation validation matches key Pro errors", () => {
    assert.throws(
        () => runCalculation({ ...defaultInputs, t: "40" }),
        /Wall thickness \$t\$ must be less than \$D\/2\$\./,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, bow: "0.021" }),
        /Bow \$b_o\$ exceeds ISO 22156/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, bow: "0.02" }),
        /must be less than 0\.02 for compression checks/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, species: "custom", fmk: "0" }),
        /Bending strength \$f_\{m,k\}\$ must be positive/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, L: "0" }),
        /Member length \$L\$ must be positive/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, K: "0" }),
        /Effective length factor \$K\$ must be positive/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, Pc: "-1" }),
        /Compression \$P_c\$ must be non-negative/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, M: "0", V: "0", Pc: "0", Pt: "0" }),
        /No demands provided/,
    );
    assert.throws(
        () => runCalculation({ ...defaultInputs, Pc: "100" }),
        /Combined-action magnifier \$B\$ is non-physical/,
    );
});

test("date and print title helpers match Pro", () => {
    const originalTimezone = process.env.TZ;

    try {
        process.env.TZ = "America/Los_Angeles";
        const utcTomorrowInUSEvening = new Date("2026-07-10T02:30:00.000Z");
        assert.equal(formatLocalDateForInput(utcTomorrowInUSEvening), "2026-07-09");
    } finally {
        if (originalTimezone === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = originalTimezone;
        }
    }

    assert.equal(
        buildPrintDocumentTitle({
            date: "2026-07-17",
            component: "Roof culm / C3",
            project: "Community Hall: Phase 1",
        }),
        "2026-07-17-Roof culm - C3-Community Hall- Phase 1",
    );
    assert.equal(
        buildPrintDocumentTitle({
            date: "2026-07-17",
            component: "",
            project: "Community Hall",
        }),
        "Bamboo Culm Sizer",
    );
});

test("static page exposes the Pro input contract without legacy controls", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

    for (const id of [
        "D", "t", "bow", "species", "fmk", "fc0k", "ft0k", "fvk",
        "Ek_mean", "sc", "ld", "crClass", "Tsvc", "L", "K", "n_culms",
        "bundle_grid", "e_axial", "M", "V", "Pc", "Pt", "download-pdf",
        "hdr-report-title",
    ]) {
        assert.match(html, new RegExp(`id="${id}"`));
    }

    for (const id of ["Ln", "alphaE", "Ek", "mcTest", "mcService", "CF", "export-tex"]) {
        assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    }

    assert.match(html, /from Manual Table 4\.4/);
    assert.match(html, /Mean characteristic modulus/);
    assert.match(html, /SC 2 - 12% &lt; EMC &le; 20%/);
    assert.match(html, /<option value="7" selected>7<\/option>/);
    assert.match(html, /<button class="btn" id="download-pdf">Download PDF<\/button>/);
    assert.doesNotMatch(html, /LaTeX|buildLatex/);
});
