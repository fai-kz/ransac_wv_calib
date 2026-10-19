"""Ordered peak assignment with local-profile DTW and bounded registration."""
import numpy as np


def dtw_distance(a, b):
    previous = [float("inf")] * (len(b) + 1)
    previous[0] = 0.0
    for av in a:
        current = [float("inf")] * (len(b) + 1)
        for j, bv in enumerate(b, 1):
            current[j] = abs(av - bv) + min(
                previous[j], current[j - 1], previous[j - 1]
            )
        previous = current
    return previous[-1]


def normalize(values):
    values = np.asarray(values, dtype=float)
    span = np.ptp(values)
    return (values - values.min()) / span if span else np.zeros_like(values)


def match_peaks(
    tp,
    rp,
    tx,
    rx,
    ty,
    ry,
    window=45,
    *,
    strategy="position",
    predicted=None,
    radius=0.05,
):
    """Return (target sample index, reference sample index, normalized DTW cost).

    Local proposals are initialization only; callers must rebuild them with the
    ordered matcher before accepting a solution. Other strategies are one-to-one.
    """
    if not len(tp) or not len(rp):
        return []
    t, r = tx[tp], rx[rp]
    scale, offset = 1.0, 0.0
    if predicted is None and strategy == "position":
        best = -np.inf

        def support(a, b):
            distances = np.min(abs(a[:, None] - b[None, :]), axis=1)
            return np.mean(np.exp(-0.5 * (distances / 0.006) ** 2))

        for si in range(-20, 21):
            s = 1 + si * 0.01
            for oi in range(-24, 25):
                o = oi * 0.005
                p = s * t + o
                score = support(p, r) + support(r, p) - 0.01 * (abs(o) + abs(s - 1))
                if score > best:
                    best, scale, offset = score, s, o
    half = window // 2
    tw = [normalize(ty[max(0, i - half) : i + half + 1]).tolist() for i in tp]
    rw = [normalize(ry[max(0, i - half) : i + half + 1]).tolist() for i in rp]
    distances = abs(
        (predicted[tp] if predicted is not None else scale * t + offset)[:, None] - r
    )
    shape = np.full(distances.shape, np.inf)
    for i, j in zip(*np.where(distances < radius)):
        shape[i, j] = dtw_distance(tw[i], rw[j]) / max(len(tw[i]), len(rw[j]))
    if strategy == "local":
        proposed = [
            (int(tp[i]), int(rp[j]), shape[i, j])
            for i in range(len(t))
            for j in [int(np.argmin(shape[i]))]
            if np.isfinite(shape[i, j])
        ]
        used, result = set(), []
        for pair in sorted(proposed, key=lambda p: p[2]):
            if pair[1] not in used:
                used.add(pair[1])
                result.append(pair)
        return sorted(result)
    if strategy == "shape":
        pair_cost = 0.15 * distances / radius + 4 * np.minimum(shape, 1)
    else:
        pair_cost = distances / (
            radius / 1.6 if predicted is not None else 0.015
        ) + 0.15 * np.minimum(shape, 1)
    pair_cost[distances >= radius] = np.inf
    costs = np.zeros((len(t) + 1, len(r) + 1))
    steps = np.zeros_like(costs, dtype=int)
    costs[:, 0] = np.arange(len(t) + 1) * 0.8
    steps[1:, 0] = 1
    costs[0, :] = np.arange(len(r) + 1) * 0.8
    steps[0, 1:] = 2
    for i in range(1, len(t) + 1):
        for j in range(1, len(r) + 1):
            skip_t, skip_r = costs[i - 1, j] + 0.8, costs[i, j - 1] + 0.8
            matched = costs[i - 1, j - 1] + pair_cost[i - 1, j - 1]
            if matched < skip_t and matched < skip_r:
                costs[i, j], steps[i, j] = matched, 3
            elif skip_t <= skip_r:
                costs[i, j], steps[i, j] = skip_t, 1
            else:
                costs[i, j], steps[i, j] = skip_r, 2
    result = []
    i, j = len(t), len(r)
    while i or j:
        step = steps[i, j]
        if step == 3:
            result.append((int(tp[i - 1]), int(rp[j - 1]), float(shape[i - 1, j - 1])))
            i -= 1
            j -= 1
        elif step == 1:
            i -= 1
        else:
            j -= 1
    return result[::-1]
