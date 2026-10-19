# Standalone Python calibration

Install this directory with `python -m pip install -e .` (Python 3.10+).
Add `[fits]` for Astropy input or `[notebook]` for Jupyter, Matplotlib and the
historical notebook dependencies. This package needs no Node.js, browser or web
source files. Run its tests here with `python -m unittest discover -s tests -v`.

The public API is `from ransac_wv_calib import Parameters, calibrate, load_spectrum`.
`calibrate(target, reference, parameters)` accepts two Nx2 arrays, copies and
sorts finite samples, and removes duplicate coordinates (keeping the first).
It raises `ValueError` for unusable inputs, invalid parameters, insufficient
peaks or failed fits. No fallback reference or output is produced on failure.

Use `python -m ransac_wv_calib TARGET REFERENCE --output DIRECTORY` for batch use.
Parameters: `--peak-prominence`, `--dtw-window`, `--polynomial-order`,
`--ransac-iterations`, `--ransac-tolerance`. An even window is increased to the
next odd size. `--overwrite` permits replacing existing results. Output JSON
contains input paths, parameters, summary metrics, pairs, both coefficient
representations and the calibrated spectrum. CSV preserves the original flux.

`solution.coefficients_normalized` evaluates at `(x-input_origin)/input_scale`;
`solution.coefficients_input` evaluates at the original input coordinate. Both
use highest-degree-first order, compatible with `numpy.polyval`. Pair indices
are zero-based indices into the sorted, deduplicated arrays. Text files without
a supplied axis receive one-based sample coordinates.

Supply a reference with known Å wavelengths and the same approximate interval
and direction as the target. The code does not infer wavelength units or an
air/vacuum convention. FITS supports primary 1D images and linear axis keywords;
nonlinear/logarithmic WCS and table spectra require prior conversion. File input
is limited to 25 MB and 100000 samples. Up to 350 significant peaks are retained.

`legacy/` preserves the original helper modules and exploratory notebook. They
are not imported by the maintained package and still contain the old greedy
matching. Use `../examples/calibrate.ipynb` for the corrected pipeline. Existing
code importing top-level `ransac_pf` or `dtw` must migrate to the package API;
there is no silent replacement of the old `peak`/`peak_object` classes.

See the [root README](../README.md) for algorithm details, limitations, independent
web instructions and cross-language validation.
