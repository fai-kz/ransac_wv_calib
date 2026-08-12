# ransac_peakfinder

Requirements:
numpy, matplotlib, scipy

U DONT NEED TO COMPILE ANYTHING, JUST LAUNCH JUPYTER, LOAD KERNEL AND WORK!

This directory contains two .py files and one .ipynb notebook:

ransac_pf.py has the main instruments needed to things work: loader, normalization and pair construction classes and functions
dtw.py has similiar stuff but applied for dtw, but if you dont need dtw - dont import it. 

ransac_pf_usage.ipynb - name speaks for itself. notebook contains usage test case (with dtw too) and has explanatory comments. 

edit: я также загрузил 2 .txt файла, которые я преимущественно использовал при написании 

### !!!! ####
if you having a hard time reading the code or understanding the underlying algorithm, please:
1. contact me.
2. ask codEX.

## Web application

This repository also contains a browser-based interface for the wavelength calibration workflow. Its source code, built-in example spectra, tests, deployment notes, and standalone documentation are located in [`spectra-wvl-calibration-main`](./spectra-wvl-calibration-main/).

The application supports TXT, DAT, CSV, TSV, and one-dimensional primary-HDU FITS spectra. It performs peak detection, DTW matching, RANSAC fitting, displays diagnostic plots, and exports the wavelength solution as JSON and the calibrated spectrum as CSV. English is the default interface language, with an EN/RU switch available in the header.

### Run locally in development mode

Node.js 20 or newer is required. Using pnpm:

```bash
cd spectra-wvl-calibration-main
corepack enable
pnpm install
pnpm run dev
```

Alternatively, using npm:

```bash
cd spectra-wvl-calibration-main
npm install
npm run dev
```

Open the URL printed in the terminal, usually `http://127.0.0.1:5173`.

### Run the production build locally

Using pnpm:

```bash
cd spectra-wvl-calibration-main
pnpm run build
pnpm run preview
```

Or using npm:

```bash
cd spectra-wvl-calibration-main
npm run build
npm run preview
```

The production files are generated in `spectra-wvl-calibration-main/dist/`. See the [web application README](./spectra-wvl-calibration-main/README.md) for data-format details and [`INTEGRATION.md`](./spectra-wvl-calibration-main/INTEGRATION.md) for PHP deployment instructions.
