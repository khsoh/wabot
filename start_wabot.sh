#!/usr/bin/env bash

sleep 15
SCRIPTPATH="$(
    cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 || exit
    pwd -P
)"
if [[ "$#" -eq 0 && -f "$SCRIPTPATH/donotstart" ]]; then
    exit
fi

cd "$SCRIPTPATH" || exit

FNLOG=$SCRIPTPATH/wabot.log
FNSIZE=$(stat -c%s "$FNLOG")
MAXSIZE=5000000

if ((FNSIZE > MAXSIZE)); then
    rm "$FNLOG"
fi

node wabot.js >>"$FNLOG" 2>&1
