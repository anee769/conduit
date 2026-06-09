#!/usr/bin/env bash
# Generate a Software Bill of Materials (SBOM) for the Conduit images.
#
#   bash scripts/sbom.sh            # SBOM for both images → sbom/*.cyclonedx.json
#
# Uses Syft. If the `syft` binary isn't installed, falls back to the official
# anchore/syft container (requires Docker). Hand the resulting SBOMs to a security
# team so they can inventory and scan every dependency in what they're about to run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p sbom

IMAGES=("conduit-gateway:latest" "conduit-control-plane:latest")

# Build the images if they're not present yet.
for img in "${IMAGES[@]}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "Image $img not found — building via compose…"
    docker compose --profile app build "${img%%:*}" || true
  fi
done

run_syft() { # $1=image  $2=outfile
  if command -v syft >/dev/null 2>&1; then
    syft "$1" -o cyclonedx-json > "$2"
  else
    docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      anchore/syft:latest "$1" -o cyclonedx-json > "$2"
  fi
}

for img in "${IMAGES[@]}"; do
  out="sbom/${img%%:*}.cyclonedx.json"
  echo "Generating SBOM for $img → $out"
  run_syft "$img" "$out"
done

echo
echo "✅ SBOMs written to ./sbom/"
ls -la sbom/
echo
echo "Scan them for vulnerabilities with, e.g.:  grype sbom:sbom/conduit-gateway.cyclonedx.json"
