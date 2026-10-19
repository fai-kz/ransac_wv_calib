"""Deterministic DTW + RANSAC wavelength calibration, independent of the web app."""
from dataclasses import asdict, dataclass
import warnings
import numpy as np
from .dtw import match_peaks, normalize
from .agreement import make_agreement, upper_median


@dataclass(frozen=True)
class Parameters:
    peak_prominence: float = 0.01
    dtw_window: int = 45
    polynomial_order: int = 3
    ransac_iterations: int = 3000
    ransac_tolerance: float = 5.0

    def validate(self):
        if not 0 < self.peak_prominence <= 1:
            raise ValueError("peak_prominence must be in (0, 1].")
        for name, low, high in [
            ("dtw_window", 7, 501),
            ("polynomial_order", 1, 5),
            ("ransac_iterations", 10, 20000),
        ]:
            v = getattr(self, name)
            if not isinstance(v, int) or not low <= v <= high:
                raise ValueError(f"{name} must be an integer from {low} to {high}.")
        if not np.isfinite(self.ransac_tolerance) or self.ransac_tolerance <= 0:
            raise ValueError("ransac_tolerance must be positive and finite.")


def prepare_spectrum(data):
    """Copy, sort and deduplicate Nx2 coordinate/flux data; reject unusable input."""
    a = np.asarray(data, dtype=float)
    if a.ndim != 2 or a.shape[1] != 2:
        raise ValueError("Spectrum must have two columns: coordinate and intensity.")
    if len(a) > 100000:
        raise ValueError("At most 100000 samples are supported.")
    a = a[np.isfinite(a).all(axis=1)]
    a = a[np.argsort(a[:, 0], kind="stable")]
    a = a[np.r_[True, np.diff(a[:, 0]) != 0]] if len(a) else a
    if len(a) < 8 or np.ptp(a[:, 0]) == 0 or np.ptp(a[:, 1]) == 0:
        raise ValueError(
            "Need at least 8 distinct coordinates and nonconstant intensity."
        )
    return a.copy()


def find_peaks(y, prominence):
    """Web-compatible prominence and robust adjacent-difference noise floor."""
    differences = np.diff(y)
    noise = (
        1.4826 * upper_median(abs(differences - upper_median(differences))) / np.sqrt(2)
    )
    threshold = max(prominence, 4.5 * noise)
    candidates = []
    for i in range(1, len(y) - 1):
        if not (y[i] > y[i - 1] and y[i] >= y[i + 1]):
            continue
        left = right = y[i]
        for j in range(i - 1, -1, -1):
            left = min(left, y[j])
            if y[j] > y[i]:
                break
        for j in range(i + 1, len(y)):
            right = min(right, y[j])
            if y[j] > y[i]:
                break
        p = y[i] - max(left, right)
        if p >= threshold:
            candidates.append((i, p, y[i]))
    if len(candidates) > 350:
        candidates = sorted(candidates, key=lambda c: (-c[1], -c[2]))[:350]
    return np.array(sorted(c[0] for c in candidates), dtype=int)


def _random(x, y, p):
    # Same 32-bit seed and Mulberry32 sequence as the TypeScript implementation.
    mask = 0xFFFFFFFF
    seed = p.ransac_iterations ^ (p.polynomial_order << 16)
    for i in range(0, len(x), max(1, len(x) // 12)):
        seed = ((seed ^ int(np.floor(x[i] * 1e6 + 0.5))) * 16777619) & mask
        seed = ((seed ^ int(np.floor(y[i] * 10 + 0.5))) * 16777619) & mask
    while True:
        seed = (seed + 0x6D2B79F5) & mask
        value = ((seed ^ (seed >> 15)) * (1 | seed)) & mask
        value = (
            (value + (((value ^ (value >> 7)) * (61 | value)) & mask)) & mask
        ) ^ value
        yield ((value ^ (value >> 14)) & mask) / 4294967296


def _fit(x, y, degree):
    # SVD-based least squares avoids the ill-conditioning of normal equations.
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        return np.polyfit(x, y, degree)


def _increasing(c):
    v = np.polyval(c, np.linspace(0, 1, 41))
    return np.isfinite(v).all() and np.all(np.diff(v) > 0)


def fit_ransac(matches, tx, rx, p):
    x = tx[[m[0] for m in matches]]
    y = rx[[m[1] for m in matches]]
    random = _random(x, y, p)
    size = min(len(matches), max(p.polynomial_order + 1, 5))
    best = np.array([], dtype=int)
    best_rms = np.inf
    for _ in range(p.ransac_iterations):
        indices = list(range(len(matches)))
        for i in range(len(indices) - 1, len(indices) - size - 1, -1):
            j = int(next(random) * (i + 1))
            indices[i], indices[j] = indices[j], indices[i]
        sample = indices[-size:]
        try:
            c = _fit(x[sample], y[sample], p.polynomial_order)
        except (ValueError, np.linalg.LinAlgError, Warning):
            continue
        if not _increasing(c):
            continue
        residual = abs(y - np.polyval(c, x))
        inliers = np.flatnonzero(residual <= p.ransac_tolerance)
        rms = np.sqrt(np.mean(residual[inliers] ** 2)) if len(inliers) else np.inf
        if len(inliers) > len(best) or (len(inliers) == len(best) and rms < best_rms):
            best, best_rms = inliers, rms
    if len(best) < p.polynomial_order + 1:
        raise ValueError("RANSAC did not find enough inliers.")
    c = _fit(x[best], y[best], p.polynomial_order)
    refined = np.flatnonzero(abs(y - np.polyval(c, x)) <= p.ransac_tolerance)
    if len(refined) >= p.polynomial_order + 1:
        c = _fit(x[refined], y[refined], p.polynomial_order)
    final = abs(y - np.polyval(c, x)) <= p.ransac_tolerance
    if not _increasing(c) or final.sum() < p.polynomial_order + 1:
        raise ValueError("Final fit is nonmonotonic or lacks inliers.")
    return c, final


def calibrate(target, reference, parameters=None):
    """Calibrate Nx2 arrays. Reference coordinates must be wavelengths in Å.

    Axes must increase in the same spectral direction and cover approximately
    the same interval. Returned polynomial coefficients use descending powers.
    No files are modified. RMS measures residuals of fitted reference pairs.
    """
    p = parameters or Parameters()
    p.validate()
    target, reference = prepare_spectrum(target), prepare_spectrum(reference)
    tx, rx = normalize(target[:, 0]), normalize(reference[:, 0])
    ty, ry = normalize(target[:, 1]), normalize(reference[:, 1])
    tp, rp = find_peaks(ty, p.peak_prominence), find_peaks(ry, p.peak_prominence)
    if min(len(tp), len(rp)) < p.polynomial_order + 1:
        raise ValueError("Too few significant peaks for the polynomial order.")
    window = p.dtw_window + (p.dtw_window % 2 == 0)
    score = make_agreement(tx, ty, reference[:, 0], ry)
    span = np.ptp(reference[:, 0])
    low = reference[0, 0]

    def evaluate(matches):
        if len(matches) < p.polynomial_order + 1:
            return None
        try:
            c, inliers = fit_ransac(matches, tx, reference[:, 0], p)
        except (ValueError, np.linalg.LinAlgError, Warning):
            return None
        endpoints = (np.polyval(c, [0, 1]) - low) / span
        if not (-0.2 <= endpoints[0] <= 0.2 and 0.8 <= endpoints[1] <= 1.2):
            return None
        agreement = score(c)
        if not np.isfinite(agreement):
            return None
        return dict(matches=matches, coefficients=c, inliers=inliers, score=agreement)

    candidates = []
    for strategy in ["position", "shape", "local"]:
        candidate = evaluate(
            match_peaks(tp, rp, tx, rx, ty, ry, window, strategy=strategy)
        )
        if candidate is None:
            continue
        if strategy != "local":
            candidates.append(candidate)
        radius = max(
            3 / min(len(tx), len(rx)), min(0.02, 1.5 * p.ransac_tolerance / span)
        )
        for iteration in range(3):
            predicted = (np.polyval(candidate["coefficients"], tx) - low) / span
            refined = evaluate(
                match_peaks(
                    tp, rp, tx, rx, ty, ry, window, predicted=predicted, radius=radius
                )
            )
            if refined is None:
                break
            if strategy == "local" and iteration == 0:
                candidates.append(refined)
            if refined["score"] <= candidate["score"] + 1e-6:
                break
            candidates.append(refined)
            candidate = refined
    if not candidates:
        raise ValueError("No robust solution; check reference interval and parameters.")
    best = candidates[0]
    for candidate in candidates[1:]:
        if candidate["score"] > best["score"] + 0.005:
            best = candidate
    c = best["coefficients"]
    matches = []
    for (ti, ri, cost), inlier in zip(best["matches"], best["inliers"]):
        predicted = float(np.polyval(c, tx[ti]))
        matches.append(
            dict(
                target_index=ti,
                reference_index=ri,
                reference_wavelength=float(reference[ri, 0]),
                predicted_wavelength=predicted,
                residual=float(reference[ri, 0] - predicted),
                dtw_distance=float(cost),
                inlier=bool(inlier),
            )
        )
    residuals = np.array([m["residual"] for m in matches if m["inlier"]])
    wavelengths = np.polyval(c, tx)
    origin, scale = float(target[0, 0]), float(np.ptp(target[:, 0]))
    input_c = np.poly1d(c)(np.poly1d([1 / scale, -origin / scale])).c
    return dict(
        parameters=asdict(p),
        solution=dict(
            coefficient_order="highest-degree-first",
            coefficients_normalized=c.tolist(),
            coefficients_input=input_c.tolist(),
            input_origin=origin,
            input_scale=scale,
        ),
        summary=dict(
            target_peaks=len(tp),
            reference_peaks=len(rp),
            matches=len(matches),
            inliers=int(best["inliers"].sum()),
            rms_angstrom=float(np.sqrt(np.mean(residuals**2))),
            max_residual_angstrom=float(np.max(abs(residuals))),
            wavelength_min=float(wavelengths[0]),
            wavelength_max=float(wavelengths[-1]),
            profile_agreement=float(best["score"]),
        ),
        matches=matches,
        calibrated_spectrum=np.column_stack(
            [target[:, 0], wavelengths, target[:, 1]]
        ).tolist(),
    )
