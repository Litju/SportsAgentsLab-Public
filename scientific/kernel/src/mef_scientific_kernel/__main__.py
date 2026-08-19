import json

from . import KERNEL_BOUNDARY, KERNEL_PACKAGE


def main() -> None:
    print(
        json.dumps(
            {
                "boundary": KERNEL_BOUNDARY,
                "package": KERNEL_PACKAGE,
                "status": "structural-smoke-only",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
