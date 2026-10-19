import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import numpy as np
from ransac_wv_calib import Parameters, calibrate, load_spectrum
from ransac_wv_calib.dtw import match_peaks, normalize

FIXTURES = Path(__file__).parent / "fixtures"


class CalibrationTests(unittest.TestCase):
    def test_real_gratings_and_web_parity(self):
        fixtures = json.loads((FIXTURES / "grating-regression.json").read_text())
        expected = json.loads((FIXTURES / "web-results.json").read_text())
        for case, web in zip(fixtures["cases"], expected):
            with self.subTest(case=case["name"]):
                target = np.column_stack([np.arange(len(case["flux"])), case["flux"]])
                result = calibrate(target, fixtures["references"][case["grid"]])
                self.assertEqual(case["name"], web["name"])
                np.testing.assert_allclose(
                    result["solution"]["coefficients_normalized"],
                    web["coefficients"],
                    atol=1e-6,
                    rtol=0,
                )
                self.assertAlmostEqual(
                    result["summary"]["rms_angstrom"], web["rms"], places=8
                )
                pairs = [
                    [m["target_index"], m["reference_index"], m["inlier"]]
                    for m in result["matches"]
                ]
                self.assertEqual(pairs, web["matches"])
                self.assertTrue(
                    all(a[0] < b[0] and a[1] < b[1] for a, b in zip(pairs, pairs[1:]))
                )
                if case["grid"] == "2400":
                    self.assertIn([840, 885, True], pairs)
                    self.assertIn([986, 1001, True], pairs)
                c = result["solution"]["coefficients_input"]
                np.testing.assert_allclose(
                    np.polyval(c, target[:, 0]),
                    np.array(result["calibrated_spectrum"])[:, 1],
                    atol=1e-8,
                )

    def test_known_nonlinear_wavelengths_and_noise(self):
        n = 2049
        x = np.linspace(0, 1, n)
        positions = np.array(
            [
                0.08,
                0.175,
                0.202,
                0.338,
                0.372,
                0.462,
                0.568,
                0.621,
                0.67,
                0.842,
                0.918,
                0.968,
            ]
        )
        heights = np.array([0.1, 0.6, 1, 0.25] * 3)

        def forward(x):
            return 0.012 + 0.975 * x + 0.032 * x * (1 - x)

        def shape(centres, h, width):
            return np.sum(
                h * np.exp(-0.5 * ((x[:, None] - centres) / width) ** 2), axis=1
            )

        ry = shape(forward(positions), heights * np.tile([3, 0.2, 0.7, 2], 3), 0.002)
        base = shape(positions, heights, 0.0008)
        for noise in [False, True]:
            ty = base.copy()
            if noise:
                ty += 0.012 * np.sin(np.arange(n) * 1.73) + 0.009 * np.sin(
                    np.arange(n) * 2.41
                )
            target = np.column_stack([np.arange(n), ty])
            original = target.copy()
            result = calibrate(
                target,
                np.column_stack([4700 + 500 * x, ry]),
                Parameters(polynomial_order=2, ransac_tolerance=0.8),
            )
            np.testing.assert_array_equal(target, original)
            self.assertLessEqual(result["summary"]["target_peaks"], 15)
            indices = np.rint(np.array([0.08, 0.3, 0.57, 0.8, 0.96]) * (n - 1)).astype(
                int
            )
            np.testing.assert_allclose(
                np.array(result["calibrated_spectrum"])[indices, 1],
                4700 + 500 * forward(x[indices]),
                atol=0.5,
                rtol=0,
            )
        t = np.sort(np.r_[np.delete(positions, 4), 0.73])
        r = np.sort(np.r_[forward(positions), 0.79])
        ty = shape(t, heights, 0.0008)
        ry = shape(r, np.resize(heights, len(r)), 0.003)
        pairs = match_peaks(
            np.rint(t * (n - 1)).astype(int),
            np.rint(r * (n - 1)).astype(int),
            x,
            x,
            normalize(ty),
            normalize(ry),
        )
        self.assertEqual(len(pairs), 11)
        for ti, ri, _ in pairs:
            self.assertLess(abs(x[ri] - forward(x[ti])), 0.001)

    def test_invalid_inputs_and_parameters(self):
        x = np.arange(20)
        good = np.column_stack([x, np.sin(x)])
        for data in [np.ones((20, 2)), np.ones(10), good[:7]]:
            with self.assertRaises(ValueError):
                calibrate(data, good)
        for p in [
            Parameters(polynomial_order=0),
            Parameters(ransac_tolerance=float("nan")),
            Parameters(dtw_window=2),
        ]:
            with self.assertRaises(ValueError):
                calibrate(good, good, p)
        with self.assertRaises(ValueError):
            calibrate(np.column_stack([x, x]), good)
        self.assertEqual(match_peaks([], [], x, x, x, x), [])

    def test_text_formats(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "data.txt"
            p.write_text("x flux\n" + "\n".join(f"{i};{i*i}D+0" for i in range(10)))
            self.assertEqual(load_spectrum(p).shape, (10, 2))
            self.assertEqual(
                load_spectrum(p)[0, 0], 0
            )  # Headerless first rows must not be lost.
            p.write_text("\n".join(str(i * i) for i in range(10)))
            self.assertEqual(load_spectrum(p)[0, 0], 1)

    def test_fits(self):
        try:
            from astropy.io import fits
        except ImportError:
            self.skipTest("Install [fits] for FITS input test")
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "data.fits"
            hdu = fits.PrimaryHDU(np.arange(10, dtype=float) ** 2)
            hdu.header["CRVAL1"] = 4700.0
            hdu.header["CDELT1"] = 0.5
            hdu.writeto(p)
            self.assertEqual(load_spectrum(p)[-1, 0], 4704.5)
            fits.PrimaryHDU(np.ones((4, 4))).writeto(p, overwrite=True)
            with self.assertRaises(ValueError):
                load_spectrum(p)

    def test_cli_outputs_and_overwrite_guard(self):
        f = json.loads((FIXTURES / "grating-regression.json").read_text())
        case = f["cases"][0]
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            target = d / "target.txt"
            ref = d / "reference.txt"
            out = d / "result"
            np.savetxt(
                target, np.column_stack([np.arange(len(case["flux"])), case["flux"]])
            )
            np.savetxt(ref, f["references"][case["grid"]])
            cmd = [
                sys.executable,
                "-m",
                "ransac_wv_calib",
                str(target),
                str(ref),
                "--output",
                str(out),
            ]
            run = subprocess.run(cmd, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            result = json.loads((out / "solution.json").read_text())
            self.assertEqual(result["input"]["reference"], str(ref))
            self.assertEqual(
                np.loadtxt(out / "spectrum.csv", delimiter=",", skiprows=1).shape,
                (len(case["flux"]), 3),
            )
            old = (out / "solution.json").read_bytes()
            self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
            self.assertEqual(old, (out / "solution.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
