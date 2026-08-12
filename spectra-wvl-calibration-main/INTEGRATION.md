# PHP Service Integration

## Option 1: A Standalone Tool Page

1. Install Node.js 20+ on the build machine.
2. Run `corepack enable`, `pnpm install --frozen-lockfile`, and `pnpm run build`.
3. Copy the entire contents of `dist/`, including the `assets/` directory, to a location such as `/var/www/virtual-observatory/tools/wavelength-calibration/`.
4. Configure the PHP application, nginx, or Apache route to serve `index.html` from that directory.

The server does not require Python, NumPy, or SciPy because the calculation code is included in the JavaScript build.

## Where the Calculation Runs

When the page opens, the browser downloads the HTML, CSS, main JavaScript bundle, and a separate calculation module from the server. When a user selects a file, the browser reads it through the standard File API. The current project contains no `fetch` request, upload form, or API call that sends the spectrum to the PHP server.

The calculation runs in a Web Worker, which is a background JavaScript thread inside the browser tab. It prevents DTW and RANSAC from blocking the page controls and scrolling. It is not a server-side worker or a separate service.

Operational consequences:

- PHP, nginx, or Apache only serves static files, so concurrent calculations add almost no computational load to the server.
- Calculation speed depends on the user's computer.
- The included 1,024-sample example is processed quickly. Spectra with tens of thousands of samples, a large DTW window, and 20,000 iterations will require substantially more processing time.
- Protective limits are enforced: files up to 25 MB, up to 100,000 data points, and no more than 350 peaks passed to DTW.
- If the organization needs to store input spectra, manage a processing queue, or run calculations centrally, a separate server API will be required. The current version intentionally does not provide one.

## Option 2: Integration into an Existing PHP Template

After building the project, open `dist/index.html` and copy the following container into the PHP template:

```html
<div id="root"></div>
```

Also include the generated `<script type="module" ...>` and `<link rel="stylesheet" ...>` tags. Their paths must point to the copied files in `dist/assets/`. The asset filenames contain hashes and change after each new build, so deployment should preferably copy the complete generated `dist/index.html` or read a Vite manifest automatically.

## HTTP Server Requirements

- Serve `.js` files with the `text/javascript` MIME type.
- Do not block the module worker with Content Security Policy rules.
- If CSP is enabled, allow `worker-src 'self'` and `script-src 'self'`.
- Keep all generated files from `dist/assets/` together.
- Allow Blob URL downloads. A strict CSP may require `default-src 'self' blob:`.

## Updating the Built-In Reference Spectrum

Replace `src/data/reference_spectrum.txt` with a file in the same text format and rebuild the project. The file is bundled into the calculation module by `pnpm run build`; the application does not need runtime access to the server filesystem.

## Data Formats and Scientific Limitations

- For a custom text reference spectrum, the first column must contain physical wavelength values, preferably in angstroms.
- A reference FITS file uses `CRVAL1`, `CDELT1` or `CD1_1`, and `CRPIX1`. A reference FITS file without WCS is rejected to prevent a pixel axis from being presented as a wavelength axis.
- Only one-dimensional arrays in the primary HDU are supported. FITS binary tables, data stored in extensions, and multidimensional images require a separate adapter.
- The implementation follows the calculation workflow of the notebook while making RANSAC deterministic and preventing one reference peak from being assigned to multiple target peaks.

## Acceptance Checklist

1. Open the page and confirm that the interface appears in English. Click **Load example**.
2. Run the calibration with the default parameters.
3. Confirm that the DTW plot, calibrated spectrum, polynomial solution, and residual plot appear.
4. Download the JSON and CSV files. The JSON must contain `summary`, `solution`, and `matches`; the CSV must contain four columns.
5. Select **My reference spectrum** and confirm that calibration remains disabled until a reference file is provided.
6. Switch the interface to RU and verify that the headings, parameters, progress messages, and plots are translated.
