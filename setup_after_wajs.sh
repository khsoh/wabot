#!/bin/bash

BOTNAME=`node -e "console.log(require('./botconfig.json').NAME)"`

# This should be run by $BOTNAME user just after these steps:
# - executing setup_root.sh as root user
# - executing setup_before_wajs.sh as $BOTNAME user
# - installing the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
# - running the following commands to copy sources to the server NN (NN is a number)
# scp start_wabot.sh $BOTNAME@zbwajsbotNN:~/wajs
# scp index.js $BOTNAME@zbwajsbotNN:~/wajs
# scp wabot.js $BOTNAME@zbwajsbotNN:~/wajs

# Check existence of wajs subdirectory
if [ ! -d ~/wajs ]; then
    echo ~/wajs directory does not exist.  Must run setup_before_wajs.sh first.
    exit 1
fi

if [ ! -f ~/wajs/start_wabot.sh ]; then
    echo ~/wajs/start_wabot.sh has not yet been created yet.
    echo Failed setup_after_wajs.sh
    exit 1
fi
if [ ! -f ~/wajs/index.js ]; then
    echo ~/wajs/index.js has not yet been created yet.
    echo Failed setup_after_wajs.sh
    exit 1
fi
if [ ! -f ~/wajs/wabot.js ]; then
    echo ~/wajs/wabot.js has not yet been created yet.
    echo Failed setup_after_wajs.sh
    exit 1
fi

chmod 755 ~/wajs/start_wabot.sh

# Setup crontab to run ~/wajs/start_wabot.sh after boot up
crontab - << _end_of_crontab
@reboot /bin/bash  /home/$BOTNAME/wajs/start_wabot.sh
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
        cd ~/wajs
        /bin/bash ~/wajs/start_wabot.sh &
        exit
    fi
done
