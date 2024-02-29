#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

pushd $SCRIPTPATH >/dev/null
if [[ ! `git remote -v` ]]; then
    echo ERROR!! $SCRIPTPATH is not a cloned repository
    popd >/dev/null
    return 1
fi
popd >/dev/null

CFGJSON="$SCRIPTPATH/botconfig.json"
BOTNAME="$(node -e "console.log(require('$CFGJSON').NAME)")"

# This should be run by $BOTNAME user just after these steps:
# - executing setup_root.sh as root user
# - executing setup_before_wabot.sh as $BOTNAME user
# - installing the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
# - running the following commands to copy sources to the server NN (NN is a number)
# scp start_wabot.sh $BOTNAME@zbwajsbotNN:~/wabot
# scp index.js $BOTNAME@zbwajsbotNN:~/wabot
# scp wabot.js $BOTNAME@zbwajsbotNN:~/wabot

if [ ! -f ~/wabot/start_wabot.sh ]; then
    echo ~/wabot/start_wabot.sh has not yet been created yet.
    echo Failed setup_after_wabot.sh
    exit 1
fi
if [ ! -f ~/wabot/index.js ]; then
    echo ~/wabot/index.js has not yet been created yet.
    echo Failed setup_after_wabot.sh
    exit 1
fi
if [ ! -f ~/wabot/wabot.js ]; then
    echo ~/wabot/wabot.js has not yet been created yet.
    echo Failed setup_after_wabot.sh
    exit 1
fi

chmod 755 ~/wabot/start_wabot.sh

# Setup crontab to run ~/wabot/start_wabot.sh after boot up
crontab - << _end_of_crontab
@reboot /bin/bash  /home/$BOTNAME/wabot/start_wabot.sh
_end_of_crontab


## Prepare to reboot PC
cat << __end_message__
1. Open WhatsApp app on the bot's phone and prepare to link device to new account
2. Maximize the terminal window to prepare to scan QR code

When you have completed these steps, prepare to answer Y to the following question.
__end_message__

while [ true ]; do
    read -p "Are you ready to start the bot? " -n 1 -r
    echo   #
    if [[ $REPLY =~ ^[Yy]$ ]]
    then
        cd ~/wabot
        /bin/bash ~/wabot/start_wabot.sh &
        exit
    fi
done
