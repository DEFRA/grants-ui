#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_BROKER_LOCAL="$PROJECT_ROOT/localstack/config-broker-local"
# The config tree is built into a staging folder first so that a failed pull
# (e.g. when the developer is offline) leaves the existing config-broker-local
# folder intact as a working "cached" copy. It is only swapped in on full success.
CONFIG_BROKER_LOCAL_STAGING="$CONFIG_BROKER_LOCAL.staging.$$"
LOCAL_ALLOWLISTS_DIR="$PROJECT_ROOT/localstack/config-broker/local-allowlists"
CONFIG_REPO_OWNER="DEFRA"
CONFIG_REPO_URL_ROOT="https://github.com/$CONFIG_REPO_OWNER"
CONFIG_REPO_API_URL_ROOT="https://api.github.com/repos/$CONFIG_REPO_OWNER"
CONFIG_REPO_RAW_URL_ROOT="https://raw.githubusercontent.com/$CONFIG_REPO_OWNER"
CONFIG_REPOS=(
  grants-config-example-grants
  grants-config-woodland
  grants-config-farm-payments
  grants-config-grasslands
)

# Newline-separated "grant_name|version" entries collected while pulling config,
# used to generate the local release.yml from the actual pulled versions.
DISCOVERED_GRANTS=""

github_api_get() {
  local url="$1"
  local curl_args=(
    --fail
    --show-error
    --silent
    --location
    --retry 3
    --retry-delay 1
    --header "Accept: application/vnd.github+json"
    --header "X-GitHub-Api-Version: 2022-11-28"
  )

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl_args+=(--header "Authorization: Bearer $GITHUB_TOKEN")
  elif [ -n "${GH_TOKEN:-}" ]; then
    curl_args+=(--header "Authorization: Bearer $GH_TOKEN")
  fi

  if ! curl "${curl_args[@]}" "$url"; then
    echo "Error accessing $url" >&2
    return 1
  fi
}

resolve_latest_tag() {
  local config_repo="$1"
  local tags_url="$CONFIG_REPO_API_URL_ROOT/$config_repo/tags"
  local api_response

  echo "Resolving latest tag for $CONFIG_REPO_URL_ROOT/$config_repo..." >&2

  if ! api_response="$(github_api_get "$tags_url")"; then
    echo "Error fetching tags from $CONFIG_REPO_URL_ROOT/$config_repo" >&2
    return 1
  fi

  if ! printf '%s' "$api_response" | node -e '
const fs = require("fs")
const input = fs.readFileSync(0, "utf8")

let data
try {
  data = JSON.parse(input)
} catch (error) {
  console.error(`Error parsing GitHub API tags response: ${error.message}`)
  process.exit(1)
}

if (data.message) {
  console.error(`GitHub API error: ${data.message}`)
  process.exit(1)
}

if (!Array.isArray(data) || data.length === 0) {
  console.error("GitHub API tags response did not include any tags")
  process.exit(1)
}

const tag = data[0].name
if (!tag) {
  console.error("GitHub API tags response did not include a tag name")
  process.exit(1)
}

process.stdout.write(String(tag))
'; then
    echo "Error reading tags from $CONFIG_REPO_URL_ROOT/$config_repo" >&2
    return 1
  fi
}

list_config_files() {
  local config_repo="$1"
  local ref="$2"
  local tree_url="$CONFIG_REPO_API_URL_ROOT/$config_repo/git/trees/$ref?recursive=1"
  local api_response

  echo "Fetching configuration file list from $CONFIG_REPO_URL_ROOT/$config_repo..." >&2

  if ! api_response="$(github_api_get "$tree_url")"; then
    echo "Error fetching configuration file list from $CONFIG_REPO_URL_ROOT/$config_repo" >&2
    return 1
  fi

  if ! printf '%s' "$api_response" | node -e '
const fs = require("fs")
const input = fs.readFileSync(0, "utf8")

let data
try {
  data = JSON.parse(input)
} catch (error) {
  console.error(`Error parsing GitHub API response: ${error.message}`)
  process.exit(1)
}

if (data.message) {
  console.error(`GitHub API error: ${data.message}`)
  process.exit(1)
}

if (!Array.isArray(data.tree)) {
  console.error("GitHub API response did not include a tree")
  process.exit(1)
}

if (data.truncated) {
  console.error("GitHub API tree response was truncated")
  process.exit(1)
}

const paths = data.tree
  .filter(({ path, type }) => type === "blob" && /^configurations\/[^/]+\/[^/]+\/[^/]+$/.test(path))
  .map(({ path }) => path)
  .sort()

process.stdout.write(paths.join("\n"))
'; then
    echo "Error reading configuration file list from $CONFIG_REPO_URL_ROOT/$config_repo" >&2
    return 1
  fi
}

download_config_file() {
  local config_repo="$1"
  local config_file_path="$2"
  local target_file="$3"
  local ref="$4"
  local raw_url="$CONFIG_REPO_RAW_URL_ROOT/$config_repo/$ref/$config_file_path"
  local target_file_tmp="$target_file.tmp"
  local curl_args=(
    --fail
    --show-error
    --silent
    --location
    --retry 3
    --retry-delay 1
  )

  if ! curl "${curl_args[@]}" "$raw_url" --output "$target_file_tmp"; then
    rm -f "$target_file_tmp"
    echo "Error downloading $raw_url" >&2
    return 1
  fi

  mv "$target_file_tmp" "$target_file"
}

apply_local_allowlists() {
  local target_root="$1"
  local local_allowlist_file

  [ -d "$LOCAL_ALLOWLISTS_DIR" ] || return 0

  for local_allowlist_file in "$LOCAL_ALLOWLISTS_DIR"/*.yaml; do
    [ -e "$local_allowlist_file" ] || continue

    local grant_name
    local grant_config_dir
    local allowlist_targets
    local target_file

    grant_name="$(basename "$local_allowlist_file" .yaml)"
    # Grant folders are named grant@<version>, and the version is the repo's
    # resolved tag, so locate the folder by glob.
    grant_config_dir="$(find "$target_root" -mindepth 1 -maxdepth 1 -type d -name "$grant_name@*" | sort | head -n 1)"

    if [ -z "$grant_config_dir" ] || [ ! -d "$grant_config_dir" ]; then
      echo "Missing config broker folder for local allowlist grant: $grant_name" >&2
      return 1
    fi

    allowlist_targets="$(find "$grant_config_dir" -mindepth 2 -maxdepth 2 -type f -name allowlist.yaml | sort)"

    if [ -z "$allowlist_targets" ]; then
      echo "No downloaded allowlist.yaml found for local allowlist grant: $grant_name" >&2
      return 1
    fi

    while IFS= read -r target_file; do
      [ -n "$target_file" ] || continue

      echo "Applying local allowlist for $grant_name to ${target_file#"$target_root/"}..."
      cp "$local_allowlist_file" "$target_file"
    done <<< "$allowlist_targets"
  done
}

record_grant_version() {
  local grant_name="$1"
  local grant_version="$2"
  local existing

  while IFS= read -r existing; do
    [ -n "$existing" ] || continue
    if [ "${existing%%|*}" = "$grant_name" ]; then
      return 0
    fi
  done <<< "$DISCOVERED_GRANTS"

  DISCOVERED_GRANTS+="$grant_name|$grant_version"$'\n'
}

generate_release_file() {
  local target_file="$1"
  local entry
  local grant_name
  local grant_version

  {
    echo "releases:"
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue

      grant_name="${entry%%|*}"
      grant_version="${entry#*|}"

      echo "  - name: $grant_name"
      echo "    version: $grant_version"
      echo "    notes: Example for local usage"
      echo "    environments:"
      echo "      - name: local"
      echo "        status: active"
    done <<< "$DISCOVERED_GRANTS"
  } > "$target_file"
}

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing required command: curl" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing required command: node" >&2
  exit 1
fi

cleanup_staging() {
  rm -rf "$CONFIG_BROKER_LOCAL_STAGING"
}

# Ensure a partial/aborted run never leaves a stray staging folder behind, and
# never touches the live config-broker-local folder on failure.
trap cleanup_staging EXIT

# How many config files are already cached in the live config-broker-local
# folder. A non-empty cache means we can keep working offline when a fresh pull
# fails; an empty (or missing) cache means we have nothing to fall back to.
count_cached_config_files() {
  [ -d "$CONFIG_BROKER_LOCAL" ] || { echo 0; return 0; }
  find "$CONFIG_BROKER_LOCAL" -type f 2>/dev/null | wc -l | tr -d '[:space:]'
}

# Called when the config tree cannot be (re)built from GitHub, e.g. when offline.
# The freshly-staged tree is discarded (via the EXIT trap) and the existing
# config-broker-local folder is left untouched. When that cached folder already
# holds config files we exit successfully so `up` keeps working offline using the
# cached config; only when there is nothing cached do we exit non-zero with a
# useful error.
fall_back_to_cache_or_fail() {
  echo "$1" >&2
  if [ "$(count_cached_config_files)" -gt 0 ]; then
    echo "Keeping existing cached config at $CONFIG_BROKER_LOCAL and continuing offline." >&2
    exit 0
  fi
  echo "No cached config found at $CONFIG_BROKER_LOCAL to fall back to." >&2
  echo "An internet connection is required to download the config at least once." >&2
  exit 1
}

rm -rf "$CONFIG_BROKER_LOCAL_STAGING"
mkdir -p "$CONFIG_BROKER_LOCAL_STAGING"

for config_repo in "${CONFIG_REPOS[@]}"; do
  if ! repo_ref="$(resolve_latest_tag "$config_repo")"; then
    fall_back_to_cache_or_fail "Failed to resolve latest tag for $config_repo."
  fi

  # Strip a leading "v" so tags like v1.2.3 map to the 1.2.3 version string the
  # config broker and backend expect.
  repo_version="${repo_ref#v}"

  echo "Using version $repo_version (ref $repo_ref) of the config from $config_repo..."

  if ! config_file_paths="$(list_config_files "$config_repo" "$repo_ref")"; then
    fall_back_to_cache_or_fail "Failed to list configuration files for $config_repo."
  fi

  if [ -z "$config_file_paths" ]; then
    fall_back_to_cache_or_fail "No configuration files found in $CONFIG_REPO_URL_ROOT/$config_repo under configurations/*/*/*"
  fi

  while IFS= read -r config_file_path; do
    [ -n "$config_file_path" ] || continue

    config_relative_path="${config_file_path#configurations/}"
    grant_name="${config_relative_path%%/*}"
    service_and_file_name="${config_relative_path#*/}"
    service_name="${service_and_file_name%%/*}"
    config_file_name="${service_and_file_name#*/}"
    target_dir="$CONFIG_BROKER_LOCAL_STAGING/$grant_name@$repo_version/$service_name"
    target_file="$target_dir/$config_file_name"
    # The live folder already stores each grant under <grant>@<version>, so the
    # presence of this exact file tells us we already have this version. Reuse
    # the cached copy instead of re-downloading; only fetch what is missing (an
    # empty cache, or a new/changed version whose folder does not exist yet).
    cached_file="$CONFIG_BROKER_LOCAL/$grant_name@$repo_version/$service_name/$config_file_name"

    mkdir -p "$target_dir"
    if [ -f "$cached_file" ]; then
      echo "Reusing cached $grant_name/$service_name/$config_file_name (already at $repo_version)..."
      cp "$cached_file" "$target_file"
    else
      echo "Setting up config for $grant_name/$service_name/$config_file_name from $config_repo..."
      if ! download_config_file "$config_repo" "$config_file_path" "$target_file" "$repo_ref"; then
        fall_back_to_cache_or_fail "Failed to download $config_file_path from $config_repo."
      fi
    fi
    record_grant_version "$grant_name" "$repo_version"
  done <<< "$config_file_paths"
done

if ! apply_local_allowlists "$CONFIG_BROKER_LOCAL_STAGING"; then
  fall_back_to_cache_or_fail "Failed to apply local allowlists."
fi

if ! generate_release_file "$CONFIG_BROKER_LOCAL_STAGING/release.yml"; then
  fall_back_to_cache_or_fail "Failed to generate release.yml."
fi

# Full rebuild succeeded: refresh the live folder's contents without replacing
# the folder itself. Docker Desktop binds the folder identity into existing WSL
# containers, so replacing it leaves those containers with a stale mount source.
node "$PROJECT_ROOT/tools/replace-directory-contents.js" "$CONFIG_BROKER_LOCAL_STAGING" "$CONFIG_BROKER_LOCAL"

echo "Config broker local folder rebuilt at $CONFIG_BROKER_LOCAL."
