"""Text and optional primary-HDU one-dimensional FITS input."""
from pathlib import Path
import re
import numpy as np
from .ransac_pf import prepare_spectrum


def load_spectrum(path):
    path = Path(path)
    if path.stat().st_size > 25 * 1024 * 1024:
        raise ValueError("Maximum input size is 25 MB.")
    if path.suffix.lower() in {".fits", ".fit", ".fts"}:
        try:
            from astropy.io import fits
        except ImportError as exc:
            raise ImportError("Install ransac-wv-calib[fits] to read FITS.") from exc
        with fits.open(path) as hdus:
            y = np.asarray(hdus[0].data, dtype=float)
            h = hdus[0].header
            if y.ndim != 1:
                raise ValueError("Only 1D primary-HDU FITS spectra are supported.")
            x = np.arange(1, len(y) + 1, dtype=float)
            if "CRVAL1" in h and ("CDELT1" in h or "CD1_1" in h):
                x = float(h["CRVAL1"]) + (x - float(h.get("CRPIX1", 1))) * float(
                    h.get("CDELT1", h.get("CD1_1"))
                )
            return prepare_spectrum(np.column_stack([x, y]))
    rows = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "//")):
            continue
        values = []
        for token in re.split(r"[\s,;]+", line):
            try:
                values.append(float(re.sub(r"(?<=[0-9.])[dD](?=[+-]?\d)", "e", token)))
            except ValueError:
                pass
        if values:
            rows.append(values)
    pairs = [row[:2] for row in rows if len(row) >= 2]
    if len(pairs) >= max(8, int(len(rows) * 0.8)):
        return prepare_spectrum(pairs)
    if rows and all(len(row) == 1 for row in rows):
        return prepare_spectrum(
            np.column_stack([np.arange(1, len(rows) + 1), np.array(rows)[:, 0]])
        )
    raise ValueError(
        "Expected two numeric columns (coordinate, flux) or one flux column."
    )
