"""Run with python -m ransac_wv_calib TARGET REFERENCE --output DIRECTORY."""
import argparse
import json
from pathlib import Path
import numpy as np
from . import Parameters, calibrate, load_spectrum


def main():
    parser = argparse.ArgumentParser(
        description="Calibrate a 1D spectrum against an observed wavelength reference."
    )
    parser.add_argument("target", type=Path)
    parser.add_argument("reference", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Directory for solution.json and spectrum.csv",
    )
    parser.add_argument("--overwrite", action="store_true")
    defaults = Parameters()
    for name in defaults.__dataclass_fields__:
        value = getattr(defaults, name)
        parser.add_argument(
            "--" + name.replace("_", "-"), type=type(value), default=value
        )
    args = parser.parse_args()
    try:
        outputs = [args.output / "solution.json", args.output / "spectrum.csv"]
        if not args.overwrite and any(p.exists() for p in outputs):
            raise ValueError(
                "Output already exists. Choose another directory or use --overwrite."
            )
        if any(
            p.resolve() in {args.target.resolve(), args.reference.resolve()}
            for p in outputs
        ):
            raise ValueError("Output must not overwrite an input spectrum.")
        parameters = Parameters(
            **{k: getattr(args, k) for k in defaults.__dataclass_fields__}
        )
        result = calibrate(
            load_spectrum(args.target), load_spectrum(args.reference), parameters
        )
        result["input"] = {"target": str(args.target), "reference": str(args.reference)}
        args.output.mkdir(parents=True, exist_ok=True)
        outputs[0].write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
        np.savetxt(
            outputs[1],
            result["calibrated_spectrum"],
            delimiter=",",
            header="input_coordinate,wavelength_angstrom,intensity",
            comments="",
        )
        print(json.dumps(result["summary"], indent=2))
    except (ValueError, OSError, ImportError) as exc:
        parser.exit(2, f"Calibration failed: {exc}\n")


if __name__ == "__main__":
    main()
