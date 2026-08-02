# Bamboo Culm Sizer
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

A free, lightning-fast, client-side calculator for structural bamboo design.

This tool performs member-level Allowable Stress Design (ASD) checks per **ISO 22156 (2021)** and the **IStructE Manual for the design of bamboo structures to ISO 22156:2021 (2025)**. It calculates bending, shear, axial compression (crushing and buckling), axial tension, and combined actions for single culms and supported bundle arrangements.

> **Looking for the hosted version?** A hosted Pro version, continuously updated with new features, is available at [bamboo.oduru.dev](https://bamboo.oduru.dev). This open source repository is the self-hostable, client-side edition.

## Features

- **Instant Calculations:** The entire calculation engine runs locally in your browser. No server delays, no API limits.
- **Standards-Compliant:** Implements formulas and modification factors directly from the *IStructE Manual for the Structural Design of Bamboo (2025)*.
- **PDF Reports:** Uses the browser print workflow to create a project-labelled calculation PDF.
- **Bundle Design:** Supports the same culm counts, bundle layouts, checks, symbols, and defaults as the hosted member-design calculator.
- **Dynamic Visuals:** Real-time SVG rendering of the culm cross-section as you type.

## Scope & Limitations

This tool covers:

- Bending
- Shear
- Axial compression (crushing + Ylinen buckling)
- Axial tension
- Combined compression/tension + bending

*Note: Results must always be verified by a qualified engineer.*

## Getting Started

Because this application is 100% client-side (Static HTML/CSS/JS), there is no build step or server required!

1. Clone or download this repository.
2. Open `index.html` in your favorite web browser.
3. Start designing!

## Architecture

The calculation engine runs entirely on the client side (`assets/calc.js`). The UI remains vanilla HTML/CSS/JS and uses KaTeX for rendering mathematical formulas. There is no application build step.

## Checks

The regression suite uses Node's built-in test runner and has no package dependencies:

```bash
npm test
```

## Contributions Welcome

Pull requests are highly encouraged!

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
