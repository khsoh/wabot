#!/usr/bin/env bash

# This should be run by $BOTNAME user just after executing setup_root.sh as root
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

# Setup ~/.bash_profile
echo export NODE_PATH=\"/usr/local/lib/node_modules\" >> ~/.bash_profile

cat << __end
Install the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
scp <SSH public key of source PC/Mac> $BOTNAME@zbwajsbotNN:~/srcpubkey
ssh $BOTNAME@zbwajsbotNN "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
__end
