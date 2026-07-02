#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_BROKER_LOCAL="$PROJECT_ROOT/localstack/config-broker-local"
RELEASE_SOURCE="$PROJECT_ROOT/localstack/config-broker/release.all.yml"
LOCAL_ALLOWLISTS_DIR="$PROJECT_ROOT/localstack/config-broker/local-allowlists"
RELEASE_VERSION="1.0.1"
CONFIG_REPO_OWNER="DEFRA"
CONFIG_REPO_REF="${CONFIG_REPO_REF:-main}"
CONFIG_REPO_URL_ROOT="https://github.com/$CONFIG_REPO_OWNER"
CONFIG_REPO_API_URL_ROOT="https://api.github.com/repos/$CONFIG_REPO_OWNER"
CONFIG_REPO_RAW_URL_ROOT="https://raw.githubusercontent.com/$CONFIG_REPO_OWNER"
CONFIG_REPOS=(
  grants-config-example-grants
  grants-config-woodland
  grants-config-farm-payments
)

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

list_config_files() {
  local config_repo="$1"
  local tree_url="$CONFIG_REPO_API_URL_ROOT/$config_repo/git/trees/$CONFIG_REPO_REF?recursive=1"
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
  local raw_url="$CONFIG_REPO_RAW_URL_ROOT/$config_repo/$CONFIG_REPO_REF/$config_file_path"
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
  local local_allowlist_file

  [ -d "$LOCAL_ALLOWLISTS_DIR" ] || return 0

  for local_allowlist_file in "$LOCAL_ALLOWLISTS_DIR"/*.yaml; do
    [ -e "$local_allowlist_file" ] || continue

    local grant_name
    local grant_config_dir
    local allowlist_targets
    local target_file

    grant_name="$(basename "$local_allowlist_file" .yaml)"
    grant_config_dir="$CONFIG_BROKER_LOCAL/$grant_name@$RELEASE_VERSION"

    if [ ! -d "$grant_config_dir" ]; then
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

      echo "Applying local allowlist for $grant_name to ${target_file#"$CONFIG_BROKER_LOCAL/"}..."
      cp "$local_allowlist_file" "$target_file"
    done <<< "$allowlist_targets"
  done
}

if [ ! -f "$RELEASE_SOURCE" ]; then
  echo "Missing release file: $RELEASE_SOURCE" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing required command: curl" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing required command: node" >&2
  exit 1
fi

rm -rf "$CONFIG_BROKER_LOCAL"
mkdir -p "$CONFIG_BROKER_LOCAL"

for config_repo in "${CONFIG_REPOS[@]}"; do
  config_file_paths="$(list_config_files "$config_repo")"

  if [ -z "$config_file_paths" ]; then
    echo "No configuration files found in $CONFIG_REPO_URL_ROOT/$config_repo under configurations/*/*/*" >&2
    exit 1
  fi

  while IFS= read -r config_file_path; do
    [ -n "$config_file_path" ] || continue

    config_relative_path="${config_file_path#configurations/}"
    grant_name="${config_relative_path%%/*}"
    service_and_file_name="${config_relative_path#*/}"
    service_name="${service_and_file_name%%/*}"
    config_file_name="${service_and_file_name#*/}"
    target_dir="$CONFIG_BROKER_LOCAL/$grant_name@$RELEASE_VERSION/$service_name"
    target_file="$target_dir/$config_file_name"

    echo "Setting up config for $grant_name/$service_name/$config_file_name from $config_repo..."
    mkdir -p "$target_dir"
    download_config_file "$config_repo" "$config_file_path" "$target_file"
  done <<< "$config_file_paths"
done

apply_local_allowlists

cp "$RELEASE_SOURCE" "$CONFIG_BROKER_LOCAL/release.yml"
