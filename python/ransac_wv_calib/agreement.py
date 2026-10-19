"""Whole-spectrum candidate ranking; not an independent accuracy estimate."""
import numpy as np


def upper_median(a):
    return np.sort(a)[len(a) // 2]


def make_agreement(tx, ty, rx, ry):
    count = min(2048, len(tx), len(rx))
    grid = np.linspace(0, 1, count)
    reference_grid = rx[0] + grid * (rx[-1] - rx[0])
    radius = max(3, int(np.floor(count * 0.025 + 0.5)))

    def background(y):
        return np.array(
            [
                max(0, v - upper_median(y[max(0, i - radius) : i + radius + 1]))
                for i, v in enumerate(y)
            ]
        )

    def smooth(y):
        w = np.exp(-0.5 * (np.arange(-6, 7) / 2) ** 2)
        return np.convolve(np.pad(y, 6, mode="edge"), w / w.sum(), mode="valid")

    tc = background(np.interp(grid, tx, ty, left=0, right=0))
    rc = np.sqrt(smooth(background(np.interp(reference_grid, rx, ry, left=0, right=0))))
    energy = np.dot(rc, rc)

    def score(coefficients):
        wavelengths = np.polyval(coefficients, grid)
        if not np.isfinite(wavelengths).all() or np.any(np.diff(wavelengths) <= 0):
            return -np.inf
        target = np.sqrt(
            smooth(np.interp(reference_grid, wavelengths, tc, left=0, right=0))
        )

        def cosine(start, end):
            a, b = target[start:end], rc[start:end]
            aa, bb = np.dot(a, a), np.dot(b, b)
            return (np.dot(a, b) / np.sqrt(aa * bb) if aa > 0 and bb > 0 else 0), bb

        local = [cosine(i * count // 4, (i + 1) * count // 4) for i in range(4)]
        local = [s for s, e in local if e > energy * 0.01]
        return 0.5 * cosine(0, count)[0] + 0.5 * (np.mean(local) if local else 0)

    return score
