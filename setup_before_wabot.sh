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

# Install nodejs packages required to run whatsapp-web.js applications
npm install

popd >/dev/null || exit

CFGJSON="$SCRIPTPATH/botconfig.json"
BOTNAME="$(node -e "console.log(require('$CFGJSON').NAME)")"

cat <<__end
Install the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
scp <SSH public key of source PC/Mac> $BOTNAME@$HOSTNAME:~/srcpubkey
ssh $BOTNAME@$HOSTNAME "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
__end

# Set environment variables (adjust folder name as needed)
echo 'export JAVA_HOME="/usr/lib/jvm/java-25-openjdk-amd64"' >>~/.bashrc
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >>~/.bashrc
source ~/.bashrc

# Link to bot's signal account
# signal-cli link -n "$BOTNAME" | xargs -L 1 qrencode -o /tmp/signal-qrcode.png & while [ ! -f /tmp/signal-qrcode.png ]; do sleep 1; done
