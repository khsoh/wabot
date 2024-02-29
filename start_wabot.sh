#!/usr/bin/env bash

. $HOME/.bash_profile
sleep 15
cd $HOME/wabot
if [ -e $HOME/wabot/.wwebjs_auth/session/Default/Preferences ]; then
    cp $HOME/wabot/.wwebjs_auth/session/Default/Preferences $HOME/wabot/Preferences-`date +%s`
    sed -E -i 's/("exited_cleanly":\s*)false/\1:true/' $HOME/wabot/.wwebjs_auth/session/Default/Preferences
    sed -E -i 's/("exit_type":\s*)"Crashed"/\1"Normal"/' $HOME/wabot/.wwebjs_auth/session/Default/Preferences
fi

FNLOG=$HOME/wabot/wabot.log
FNSIZE=$(stat -c%s "$FNLOG")
MAXSIZE=5000000

if (( FNSIZE > MAXSIZE )); then
    rm $FNLOG
fi

node wabot.js >> $FNLOG 2>&1
#node wabot.js

