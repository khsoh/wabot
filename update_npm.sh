#!/usr/bin/env bash

# This should be run by $BOTNAME user just after executing setup_root.sh as root
SCRIPTPATH="$(
    cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 || exit
    pwd -P
)"

pushd "$SCRIPTPATH" >/dev/null || exit
if [[ ! $(git remote -v) ]]; then
    echo ERROR!! "$SCRIPTPATH" is not a cloned repository
    popd >/dev/null || exit
    return 1
fi

echo "Running npm update..."

# Run npm update with JSON format and capture output
# '|| true' ensures the script keeps running if npm throws an exit code
UPDATE_JSON=$(PUPPETEER_SKIP_DOWNLOAD=1 npm update --json || true)

# Extract names of updated packages using jq
UPDATED_PACKAGES=$(echo "$UPDATE_JSON" | jq -r '.add[].name, .change[].to.name' 2>/dev/null)

if [ -z "$UPDATED_PACKAGES" ]; then
    echo "No packages were updated."
    exit 0
fi

echo "The following packages were updated:"
echo "$UPDATED_PACKAGES"

# Loop through the updated packages to determine further actions
for PACKAGE in $UPDATED_PACKAGES; do
    if [ "$PACKAGE" == "puppeteer" ]; then
        echo "puppeteer updated - will install chrome browsers"
        npx puppeteer browsers install chrome
        npx puppeteer browsers install chrome-headless-shell
    fi
done
