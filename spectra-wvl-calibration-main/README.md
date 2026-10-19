# Wavelength Calibration Tool

A standalone web application for wavelength calibration of one-dimensional spectra. The algorithm was adapted from `ransac_pf_usage.ipynb` and includes normalization, prominence-based peak detection, ordered peak-sequence matching supported by Dynamic Time Warping of local peak profiles, RANSAC outlier rejection, and a final pixel-to-wavelength polynomial solution.

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

## Peak matching

Candidate assignments use three starting hypotheses: position-led ordered matching after a bounded affine registration, shape-led ordered DTW matching, and local DTW proposals used only to seed a robust fit. The local proposals are rebuilt into an ordered one-to-one assignment before they can become the final result. Missing and extra lines can be skipped.

Each viable hypothesis is fitted with RANSAC and refined up to three times by rematching around its nonlinear polynomial. Candidate selection compares the full spectra, including four wavelength regions, rather than minimizing only the residuals of the selected pairs. The comparison subtracts a median background, smooths both profiles, and uses square-root contrast to reduce sensitivity to relative brightness. It is a selection diagnostic, not independent validation. An alternative must improve the agreement score by more than 0.005 to replace the first viable solution. Exported `dtwDistance` remains the local normalized DTW cost.

The initial affine search spans scales 0.8–1.2 and normalized offsets −0.12–0.12, with a 0.05 candidate radius. Refinement uses a narrower radius derived from the RANSAC tolerance and reference span (with sampling floors and a 0.02 cap). Candidate endpoint wavelengths must remain within 20% of the reference span around its endpoints. Target and reference must cover approximately the same interval in the same direction: this is not a blind full-atlas search. Crop a wide laboratory atlas to the expected interval first. Unanchored edges remain extrapolations, and a low RMS does not prove line identities or absolute accuracy.

Peak prominence uses the larger of the user threshold and 4.5 times a robust noise estimate from adjacent-sample differences. This prevents large numbers of noise maxima in weak spectra from dominating registration. Hover over either uploaded filename to see its full name.

`npm run test:smoke` includes known synthetic wavelengths, changed line brightness and widths, nonlinear dispersion, missing/extra lines, noisy spectra, and the actual February 1800/2400 regressions in `scripts/fixtures/grating-regression.json`. The fixtures contain flux arrays from the HD49340/MRK6 masters dated 2024-02-06, references `lamp1800_rms0103` and `lamp2400_rms0309`, and coefficients from the prior version. They test preservation of the working 1800 mapping and improved 2400 profile alignment, not laboratory accuracy.

On the reported HD49340 2400 example, profile agreement improves from 0.797 to 0.917 and the fitted-pair RMS changes from 1.4868 to 0.9778 Å. MRK6 agreement improves from 0.792 to 0.904, with RMS changing from 1.4973 to 0.8368 Å. A separate batch check of all twenty available master spectra preserved the wavelength coefficients of all ten 1800 masters exactly. No observation FITS files are rewritten by these checks.
