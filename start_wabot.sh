#!/bin/bash

. /home/zbpabot/.bash_profile
sleep 15
cd /home/zbpabot/wajs
if [ -e /home/zbpabot/wajs/.wwebjs_auth/session/Default/Preferences ]; then
    cp /home/zbpabot/wajs/.wwebjs_auth/session/Default/Preferences /home/zbpabot/wajs/Preferences-`date +%s`
    sed -E -i 's/("exited_cleanly":\s*)false/\1:true/' /home/zbpabot/wajs/.wwebjs_auth/session/Default/Preferences
    sed -E -i 's/("exit_type":\s*)"Crashed"/\1"Normal"/' /home/zbpabot/wajs/.wwebjs_auth/session/Default/Preferences
fi

FNLOG=$HOME/wajs/wabot.log
FNSIZE=$(stat -c%s "$FNLOG")
MAXSIZE=5000000

if (( FNSIZE > MAXSIZE )); then
    rm $FNLOG
fi

node wabot.js >> $FNLOG 2>&1
#node wabot.js

