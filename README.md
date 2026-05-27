# Bamboo Culm Sizer
[![Live Demo](https://img.shields.io/badge/Live_Demo-bamboo.oduru.dev-success?style=for-the-badge)](https://bamboo.oduru.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

A free, lightning-fast, client-side calculator for structural bamboo design. 
This tool performs Member-level Allowable Stress Design (ASD) checks per the **IStructE Manual (2025)** and **ISO 22156** standards. It calculates bending, shear, axial compression (crushing + buckling), axial tension, and combined actions for hollow bamboo culms.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable source code — this is the version to fork, reference, or build from |
| `production` | Powers the live website at [bamboo.oduru.dev](https://bamboo.oduru.dev) — may contain changes ahead of `main` |

> **For contributors and forkers:** Use `main` as your base. The `production` branch reflects what is currently deployed and may include work-in-progress UI or feature changes not yet merged.

## Features
- **Instant Calculations:** The entire calculation engine runs locally in your browser. No server delays, no API limits.
- **Standards-Compliant:** Implements formulas and modification factors directly from the *IStructE Manual for the Structural Design of Bamboo (2025)*.
- **LaTeX Export:** Automatically generates a fully formatted, professional LaTeX calculation package with a single click.
- **Dynamic Visuals:** Real-time SVG rendering of the culm cross-section as you type.

## Scope & Limitations
This tool covers:
- Bending
- Shear
- Axial compression (crushing + Ylinen buckling)
- Axial tension
- Combined compression/tension + bending

*Note: This version currently excludes ovality grading check, deflection, lateral-torsional buckling, bearing and circumferential bearing (§7.3.2), cleavage at holes (§7.4), connections (Chapter 7), and compression perpendicular to fibres. Results must always be verified by a qualified engineer.*

## Getting Started
Because this application is 100% client-side (Static HTML/CSS/JS), there is no build step or server required!

1. Clone or download this repository.
2. Open `index.html` in your favorite web browser.
3. Start designing!

## Architecture
The "brain" of the calculator runs entirely on the client-side (`assets/calc.js`). This ensures the tool functions perfectly offline and provides instant results. The UI is built with vanilla HTML/CSS/JS and uses KaTeX for rendering mathematical formulas.

## Contributions Welcome
Pull requests are highly encouraged! Contributions can include implementing the missing scope items that this version does not currently cover (such as lateral-torsional buckling, connections, bearing, or deflection), fixing edge cases in ISO 22156, or adding support for different engineering standards.

1. Fork the Project
2. Create your Feature Branch from `main` (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request targeting `main`

## License
Distributed under the MIT License. See `LICENSE` for more information.

## Author
**J. Oduru**  
[oduru.dev](https://oduru.dev)
