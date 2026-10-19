# Spectral wavelength calibration

Calibrate an extracted one-dimensional lamp spectrum against an observed reference
spectrum with a known wavelength axis. The repository provides **two independent
implementations** of the corrected peak-matching workflow: a Python package for
notebooks and automated processing, and a browser application for visual review.
Neither requires the other at runtime.

## Repository layout

| Path | Purpose |
| --- | --- |
| `python/ransac_wv_calib/` | Maintained Python library and command-line interface |
| `python/tests/` | Synthetic, real-spectrum, input/output and web-parity regression tests |
| `python/legacy/` | Original exploratory Python helpers and notebook, preserved for historical comparison |
| `spectra-wvl-calibration-main/` | Standalone React/TypeScript web application, tests and deployment notes |
| `examples/calibrate.ipynb` | Notebook using the maintained Python API, with diagnostic plots |
| `examples/data/` | Original sample target and observed reference spectra |
| `examples/plots/` | Historical plots from the original notebook; not validation of the current algorithm |
| `scripts/check-parity.mjs` | Optional cross-language check using both implementations |

The original root-level `ransac_pf.py`, `dtw.py`, and `ransac_pf_usage.ipynb` moved
to `python/legacy/`. Their old per-peak greedy matching is **not** the maintained
algorithm. New code should import `ransac_wv_calib`; the corrected implementation
lives in `python/ransac_wv_calib/ransac_pf.py` and `dtw.py`. The web directory keeps
its existing name so current Vite launch commands and deployment paths still work.

## Run Python

Python 3.10 or later is required. From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e './python[fits,notebook]'
python -m ransac_wv_calib \
  examples/data/Lamp_3s_19Aur_360_5s_1D_3.txt \
  examples/data/lamp_calib --output work/example360
```

The CLI writes `solution.json` and `spectrum.csv` (input coordinate, wavelength in
Å, original intensity). It never edits the input spectra and refuses to replace
existing outputs unless `--overwrite` is supplied. Run `python -m ransac_wv_calib
--help` for parameters. The reference is always explicit; there is no fallback to
an example reference in Python.

For a minimal installation without FITS or notebooks, use
`python -m pip install -e ./python`. Only NumPy is required by the calibration core.

```python
from ransac_wv_calib import Parameters, calibrate, load_spectrum

result = calibrate(
    load_spectrum("target.txt"),
    load_spectrum("reference.txt"),
    Parameters(polynomial_order=3, ransac_tolerance=5.0),
)
print(result["summary"])
```

For plots, run `jupyter lab examples/calibrate.ipynb`. Select the environment where
the package is installed. The notebook shows the input profiles, proposed and
accepted pairs, calibrated overlay, and fit residuals. It calibrates existing 1D
spectra; dark subtraction and 2D aperture extraction are outside this repository.
See [Python details](python/README.md).

## Run the web app

Node.js 20+ is required; Python is not required. From the repository root:

```bash
cd spectra-wvl-calibration-main
npm install
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite (usually http://127.0.0.1:5173). Upload a target and a
reference, check **Reference for next calibration**, then run calibration. You can
replace the target and retain the uploaded reference in the current page session.
A full page reload requires reuploading files. Hover over filenames to see their
full names. Results and exports identify the reference actually used.

To build and preview static production files:

```bash
npm run build
npm run preview
```

The browser performs calculations in a Web Worker; spectra are not uploaded to a
calibration server. Deploy `dist/` to a static host or PHP service. See the
[web README](spectra-wvl-calibration-main/README.md) and
[deployment instructions](spectra-wvl-calibration-main/INTEGRATION.md).

## Inputs and scientific interpretation

Both versions accept numeric text with two columns (`coordinate intensity`) or
one intensity column for targets. Text delimiters may be spaces, tabs, commas or
semicolons. A one-column target gets sample coordinates starting at 1. FITS input
supports a one-dimensional primary image HDU; Python requires the `fits` extra.
The reference must supply actual wavelengths in its first column or linear FITS
WCS (`CRVAL1`, `CDELT1`/`CD1_1`, optionally `CRPIX1`). Check reference units yourself:
use Å, with the same air/vacuum convention throughout. No unit or air/vacuum
conversion is performed. A numerical pixel axis cannot be distinguished reliably
from a numerical wavelength axis.

Target and reference must cover approximately the **same wavelength interval and
spectral direction**. For these observations, 1800 lines/mm corresponds to Hα,
2400 to Hβ, and 360 to the broader combined region. Grating names are not enough
to determine an exact wavelength interval; select the appropriate reference.
This is not a blind search of a full laboratory atlas. Crop a broad reference to
the expected interval before matching.

The corrected workflow:

1. Normalize and detect significant peaks using prominence and a robust noise floor.
2. Generate position-led and shape-led ordered matches, plus local DTW proposals
   used only to initialize a robust fit. Final pairs are ordered and one-to-one;
   missing or extra lines may be skipped.
3. Fit with deterministic RANSAC, then rematch around the nonlinear polynomial.
4. Choose between candidates using agreement across the spectrum, including four
   wavelength regions, rather than fitted-pair RMS alone.
5. Return the wavelength polynomial, pairs, residuals and calibrated spectrum.

Defaults are prominence 0.01, DTW window 45 samples, polynomial degree 3,
3000 RANSAC iterations and a 5 Å RANSAC residual tolerance. That tolerance controls
inlier selection; it is not a claimed calibration accuracy. Polynomial coefficients
use descending powers. The normalized coordinate is `(x - origin) / scale`.

**RMS is the residual scatter of fitted pairs against the selected reference.**
It does not measure absolute laboratory accuracy and inherits errors in an
observed reference. Broad blends, missing lines and extrapolation outside the
outermost accepted anchors need visual review. Whole-spectrum agreement is a
candidate-selection diagnostic, not independent validation of line identities.

## Verification

Python tests run independently:

```bash
python -m unittest discover -s python/tests -v
```

Web checks run independently:

```bash
cd spectra-wvl-calibration-main
npm run test:smoke
npm run typecheck
npm run build
```

After installing both environments, run the live parity check from the root:

```bash
node scripts/check-parity.mjs --python .venv/bin/python
```

This compares matched pairs, inlier labels and wavelength coefficients on the
four February HD49340/MRK6 1800/2400 fixtures, and checks that both fixture copies
are identical. Python uses NumPy's stable polynomial least-squares solver; the
web uses its own solver. Numerical results are checked with a tolerance, not
assumed bit-for-bit identical. Each implementation keeps a fixture copy so its
own tests can run without the other source tree. Python tests also keep a web
result snapshot; the live parity check detects drift from the current web code.
Synthetic tests use known wavelengths and changed line brightness/width,
nonlinearity, missing/extra lines and noise. Real-data agreement demonstrates
regression coverage, not independently established absolute wavelength accuracy.
