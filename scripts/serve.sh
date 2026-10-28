#!/bin/sh
# Local preview: SI on http://localhost:8000/, EN on http://localhost:8000/en/
cd "$(dirname "$0")/../site" && python3 -m http.server "${1:-8000}"
