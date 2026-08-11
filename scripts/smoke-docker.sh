#!/usr/bin/env sh

set -eu

image="${CHILLSCOPE_IMAGE:-chillscope:local}"
container="chillscope-smoke-$$"

cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
}

fail() {
  printf 'Docker smoke test failed: %s\n' "$1" >&2
  docker logs "$container" >&2 || true
  exit 1
}

curl_request() {
  curl --connect-timeout 2 --max-time 5 "$@"
}

status_for() {
  curl_request --silent --output /dev/null --write-out '%{http_code}' "$base_url$1"
}

assert_status() {
  expected="$1"
  path="$2"
  actual="$(status_for "$path")"
  [ "$actual" = "$expected" ] || fail "$path returned $actual instead of $expected"
}

assert_header() {
  path="$1"
  pattern="$2"
  headers="$(curl_request --silent --show-error --head "$base_url$path" | tr -d '\r')"
  printf '%s\n' "$headers" | grep -Eiq "$pattern" || fail "$path is missing header /$pattern/"
}

trap cleanup EXIT INT TERM

docker run --detach \
  --name "$container" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --publish 127.0.0.1::8080 \
  "$image" >/dev/null

host_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' "$container")"
base_url="http://127.0.0.1:$host_port"

attempt=0
until curl_request --silent --fail "$base_url/index.html" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 40 ] || fail "the server did not become ready"
  sleep 0.25
done

for path in / /dashboard /measurements /alarms /machines /settings; do
  assert_status 200 "$path"
  body="$(curl_request --silent --show-error --fail "$base_url$path")"
  printf '%s' "$body" | grep -q '<app-root' || fail "$path did not return the Angular shell"
done

for path in \
  /ngsw.json \
  /ngsw-worker.js \
  /manifest.webmanifest \
  /assets/i18n/en.json \
  /assets/i18n/pl.json \
  /assets/schema/machine-schematic.schema.json; do
  assert_status 200 "$path"
done

assert_status 404 /missing.js
assert_status 404 /robots.txt

assert_header /index.html '^Cache-Control: no-cache$'
assert_header /manifest.webmanifest '^Content-Type: application/manifest\+json'
assert_header /ngsw.json '^Cache-Control: no-cache$'
assert_header /index.html '^X-Content-Type-Options: nosniff$'
assert_header /index.html '^Referrer-Policy: strict-origin-when-cross-origin$'

index_html="$(curl_request --silent --show-error --fail "$base_url/index.html")"
hashed_script="$(printf '%s' "$index_html" | grep -Eo '(main|chunk)-[A-Z0-9]{8}\.js' | head -n 1)"
[ -n "$hashed_script" ] || fail "the shell does not reference a hashed JavaScript asset"
assert_header "/$hashed_script" '^Cache-Control: public, max-age=31536000, immutable$'

compressed_headers="$(curl_request --silent --show-error --head --header 'Accept-Encoding: gzip' "$base_url/$hashed_script" | tr -d '\r')"
printf '%s\n' "$compressed_headers" | grep -Eiq '^Content-Encoding: gzip$' \
  || fail "$hashed_script is not served with gzip when requested"

attempt=0
health="starting"
while [ "$health" = "starting" ]; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 20 ] || fail "the container healthcheck did not settle"
  sleep 0.5
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
done
[ "$health" = "healthy" ] || fail "container health is $health"

runtime_user="$(docker image inspect --format '{{.Config.User}}' "$image")"
[ "$runtime_user" = "101:101" ] || fail "runtime user is $runtime_user instead of 101:101"

printf 'Docker smoke test passed: %s on %s\n' "$image" "$base_url"
