#!/usr/bin/env bash

sleep 15
SCRIPTPATH="$( cd -- "$(dirname "$BASH_SOURCE[0]")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH
if [ -e $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences ]; then
    cp $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences $SCRIPTPATH/Preferences-`date +%s`
    sed -E -i 's/("exited_cleanly":\s*)false/\1:true/' $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences
    sed -E -i 's/("exit_type":\s*)"Crashed"/\1"Normal"/' $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences
fi

FNLOG=$SCRIPTPATH/wabot.log
FNSIZE=$(stat -c%s "$FNLOG")
MAXSIZE=5000000

if (( FNSIZE > MAXSIZE )); then
    rm $FNLOG
fi

node wabot.js >> $FNLOG 2>&1
#node wabot.js

