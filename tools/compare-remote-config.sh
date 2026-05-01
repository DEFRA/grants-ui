FILE_PATH="example-grant-with-auth/grants-ui/example-grant-with-auth.yaml"
LOCAL_FILE="src/server/common/forms/definitions/example-grant-with-auth.yaml"

echo "example-grant-with-auth config has changed - checking grant-config-example-grants repo to see if local config change is reflected there..."
REMOTE_CONFIG_UPDATED_TO_MATCH=false
# get latest tagged file, and compare
TAG=$(curl -s https://api.github.com/repos/DEFRA/grant-config-example-grants/tags | jq -r '.[0].name')
curl -sL https://raw.githubusercontent.com/DEFRA/grant-config-example-grants/$TAG/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml -o tagged.yaml
if ! diff -q "$LOCAL_FILE" tagged.yaml > /dev/null; then
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
    if curl --silent --fail "$RAW_URL" -o pr_file.yml; then
      if ! diff -q "$LOCAL_FILE" pr_file.yml > /dev/null; then
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
