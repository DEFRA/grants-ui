#!/bin/bash

FORMS_DIR="src/server/common/forms/definitions"
CONFIG_BROKER_LOCAL="localstack/config-broker-local"
RELEASE_TEMPLATE="localstack/config-broker/release.yml"
SLUG_LIST=example-grant-with-auth,pigs-might-fly,woodland

for file in "$FORMS_DIR"/*.yaml; do
  [ -e "$file" ] || continue
  filename=$(basename "$file")
  grant_name="${filename%.*}"

  if [[ ! ",$SLUG_LIST," =~ ",$grant_name," ]]; then
    continue
  fi

  target_dir="$CONFIG_BROKER_LOCAL/$grant_name@1.0.1"

  echo "Setting up config for $grant_name..."
  mkdir -p "$target_dir"
  cp "$file" "$target_dir/"
done

cp localstack/config-broker/release.all.yml localstack/config-broker-local/release.yml
