if ! command -v yq >/dev/null 2>&1; then
  echo "❌ yq is required but not installed"
  exit 1
fi

# Stage intermediate YAML in a temp dir so we don't litter the repo root on the
# long-lived runner — any leftover files there could pollute git status or be
# picked up stale by a subsequent run if this script errors out partway.
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

FILE_PATH="example-grant-with-auth/grants-ui/example-grant-with-auth.yaml"
LOCAL_FILE="src/server/common/forms/definitions/example-grant-with-auth.yaml"

echo "example-grant-with-auth config has changed - checking grant-config-example-grants repo to see if local config change is reflected there..."
REMOTE_CONFIG_UPDATED_TO_MATCH=false
# Normalise the local file through yq once so remote comparisons (also yq-normalised
# below) aren't tripped up by hand-formatted whitespace or quoting differences.
yq '.' "$LOCAL_FILE" > "$TMPDIR/local.normalized.yaml"
# get latest tagged file, and compare
TAG=$(curl -sS --fail https://api.github.com/repos/DEFRA/grant-config-example-grants/tags | jq -r '.[0].name')
if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then
  echo "❌ Could not determine latest tag for DEFRA/grant-config-example-grants"
  exit 1
fi
if ! curl -sSL --fail "https://raw.githubusercontent.com/DEFRA/grant-config-example-grants/$TAG/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml" -o "$TMPDIR/tagged.yaml"; then
  echo "❌ Failed to fetch tagged config for $TAG from DEFRA/grant-config-example-grants"
  exit 1
fi
# TGC-1355: example-grant-with-auth-submission.schema.json was deliberately removed from this repo,
# and with it the metadata.submission block in the local YAML. The upstream config repo intentionally
# still carries both, so strip metadata.submission from the remote copy before diffing rather than
# round-tripping the deletion through DEFRA/grant-config-example-grants.
yq -i 'del(.metadata.submission)' "$TMPDIR/tagged.yaml"
if ! diff -q "$TMPDIR/local.normalized.yaml" "$TMPDIR/tagged.yaml" > /dev/null; then
      echo "❌ Difference found in latest tagged remote config file. Will check for any outstanding PRs"
    else
      echo "✅ Latest tagged config file is the same as modified local one"
      REMOTE_CONFIG_UPDATED_TO_MATCH=true
    fi

if [ "$REMOTE_CONFIG_UPDATED_TO_MATCH" = "false" ]; then

  while read -r pr; do
    BRANCH=$(echo "$pr" | jq -r '.head.ref')
    REPO_FULL=$(echo "$pr" | jq -r '.head.repo.full_name')

    echo "Checking PR branch: $REPO_FULL@$BRANCH"

    RAW_URL="https://raw.githubusercontent.com/$REPO_FULL/$BRANCH/$FILE_PATH"

    # Try to fetch file (may not exist in PR)
    if curl --silent --fail "$RAW_URL" -o "$TMPDIR/pr_file.yml"; then
      # Same TGC-1355 strip as above: the metadata.submission block was deliberately deleted locally
      # but remains upstream, so remove it from the PR copy before diffing.
      yq -i 'del(.metadata.submission)' "$TMPDIR/pr_file.yml"
      if ! diff -q "$TMPDIR/local.normalized.yaml" "$TMPDIR/pr_file.yml" > /dev/null; then
        echo "❌ Difference found in PR: $BRANCH"
      else
        echo "✅ Found matching updated config in PR on branch: $BRANCH"
        REMOTE_CONFIG_UPDATED_TO_MATCH=true
      fi
    else
      echo "File not present in PR: $BRANCH"
    fi
done < <(curl -s "https://api.github.com/repos/DEFRA/grant-config-example-grants/pulls?state=open" | jq -c '.[]')
fi

if [ "$REMOTE_CONFIG_UPDATED_TO_MATCH" = "false" ]; then
  echo "❌ Local changes to example grant with auth config not reflected in remote config repo, please keep that in sync"
  exit 1
else
  echo "✅ Found updated changes in remote config repo"
fi
