#!/usr/bin/env bash
# Render the composition baseline in a Linux container and compare it with the macOS
# baseline. Usage: scripts/composition/linux/run.sh amd64|arm64 [baseline options]
# Writes tests/visual/composition-baselines/linux-<arch>.json and saves frames that
# differ from darwin-arm64 under benchmarks/results/composition-linux-<arch>/.
# With CHECK=1, checks the committed linux-<arch>.json instead of writing one.
set -euo pipefail
platform="${1:?usage: run.sh amd64|arm64 [options]}"
shift
root="$(cd "$(dirname "$0")/../../.." && pwd)"
image="still-shift-composition-linux:${platform}"
out="${root}/benchmarks/results/composition-linux-${platform}${CHECK:+-check}"
rm -rf "${out}"
mkdir -p "${out}"
docker build --platform "linux/${platform}" -t "${image}" "${root}/scripts/composition/linux"
# The working tree, not HEAD, so uncommitted harness changes are included.
(cd "${root}" && git ls-files -co --exclude-standard -z | tar --null -T - -cf "${out}/source.tar")
docker run --rm --platform "linux/${platform}" --ipc=host -e CHECK="${CHECK:-}" \
  -v "${out}:/out" -v "still-shift-pnpm-store-${platform}:/pnpm-store" \
  "${image}" bash -euo pipefail -c '
    tar -xf /out/source.tar -C /repo
    pnpm config set store-dir /pnpm-store >/dev/null
    pnpm install --frozen-lockfile --reporter=silent
    node --version
    if [ "${CHECK:-}" = 1 ]; then
      node --import tsx scripts/composition/baselines.ts --check "$@"
      exit
    fi
    node --import tsx scripts/composition/baselines.ts --write \
      --baseline darwin-arm64 --save-mismatches /out/frames "$@"
    cp tests/visual/composition-baselines/linux-*.json /out/
    cp benchmarks/composition-baseline.json /out/timings.json
  ' run "$@"
rm -f "${out}/source.tar"
