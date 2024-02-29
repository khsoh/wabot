#!/usr/bin/env bash

. $HOME/.bash_profile
sleep 5
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH
if [ -e $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences ]; then
    cp $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences $SCRIPTPATH/Preferences-`date +%s`
    sed -E -i 's/("exited_cleanly":\s*)false/\1:true/' $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences
    sed -E -i 's/("exit_type":\s*)"Crashed"/\1"Normal"/' $SCRIPTPATH/.wwebjs_auth/session/Default/Preferences
fi
node wabot.js

