#!/usr/bin/env bash

# This should be run by $BOTNAME user just after executing setup_root.sh as root
SCRIPTPATH="$( cd -- "$(dirname "$BASH_SOURCE[0]")" >/dev/null 2>&1 ; pwd -P )"

pushd $SCRIPTPATH >/dev/null
if [[ ! `git remote -v` ]]; then
    echo ERROR!! $SCRIPTPATH is not a cloned repository
    popd >/dev/null
    return 1
fi

# Install nodejs packages required to run whatsapp-web.js applications
npm install follow-redirects
npm install qrcode
npm install sjcl

## TEMP FIX for transition to new whatsapp
npm install github:pedroslopez/whatsapp-web.js#webpack-exodus

popd >/dev/null

CFGJSON="$SCRIPTPATH/botconfig.json"
BOTNAME="$(node -e "console.log(require('$CFGJSON').NAME)")"

cat << __end
Install the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
scp <SSH public key of source PC/Mac> $BOTNAME@$HOSTNAME:~/srcpubkey
ssh $BOTNAME@$HOSTNAME "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
__end
