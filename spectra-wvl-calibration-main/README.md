# Wavelength Calibration Tool

A standalone web application for wavelength calibration of one-dimensional spectra. The algorithm was adapted from `ransac_pf_usage.ipynb` and includes normalization, prominence-based peak detection, Dynamic Time Warping of local peak profiles, RANSAC outlier rejection, and a final pixel-to-wavelength polynomial solution.

English is the default interface language. Users can switch between English and Russian using the EN/RU control in the header.

In the current architecture, the PHP server serves the static application files while the JavaScript calculation runs in the user's browser. The project does not upload spectra to an API. See `INTEGRATION.md` for deployment details and performance considerations.

## Supported Data

- TXT, DAT, CSV, and TSV files with either `coordinate intensity` columns or a single `intensity` column; supported delimiters are spaces, tabs, commas, and semicolons.
- One-dimensional FITS arrays stored in the primary HDU with `BITPIX` values of 8, 16, 32, 64, -32, or -64.
- FITS binary tables, FITS extensions, and two-dimensional images are not currently supported.
- A custom reference spectrum must provide a wavelength axis in the first text column or through FITS WCS keywords.
- The maximum file size is 25 MB and the maximum number of data points is 100,000.

A target text spectrum may contain only an intensity column; sample numbers will then be used as its coordinate axis. A reference spectrum must have a known wavelength scale supplied by the first text column or by the FITS WCS keywords `CRVAL1`, `CDELT1`/`CD1_1`, and `CRPIX1`.

## Local Development

Node.js 20+ and pnpm 10+ are recommended. npm 10+ can also be used.

```bash
cd spectra-wvl-calibration-main
corepack enable
pnpm install
pnpm run dev
```

If pnpm is unavailable, run `npm install` followed by `npm run dev`.

Open the URL printed by Vite, usually `http://127.0.0.1:5173`. Click **Load example**, then **Run calibration**.

## Production Build

```bash
pnpm run build
pnpm run preview
```

The generated static files are placed in `dist/`. The build uses relative asset paths, so it can be deployed inside a website subdirectory.

Run the algorithm smoke test and TypeScript validation with:

```bash
pnpm run test:smoke
pnpm run typecheck
```

## PHP Integration

See [INTEGRATION.md](./INTEGRATION.md) for detailed instructions. In short, run `pnpm run build`, copy the contents of `dist/` into a public directory of the PHP service, and either expose `index.html` as a separate route or include its root container and generated asset references in a PHP template.

## Output Files

- `wavelength_calibration_solution.json` contains the parameters, quality metrics, peak matches, polynomial coefficients, and diagnostic series.
- `calibrated_spectrum.csv` contains the original coordinate, calculated wavelength, original intensity, and normalized intensity.

Polynomial coefficients in the JSON file are ordered from the highest degree to the constant term. Separate coefficient arrays are provided for the original coordinate and the normalized coordinate.
