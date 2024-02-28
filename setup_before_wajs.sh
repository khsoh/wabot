#!/usr/bin/env bash

# This should be run by $BOTNAME user just after executing setup_root.sh as root
BOTNAME=`node -e "console.log(require('./botconfig.json').NAME)"`

# Generate ssh key
ssh-keygen -t ecdsa -b 521

# Create wajs subdirectory
if [ ! -d ~/wajs ]; then
    mkdir ~/wajs
fi

# Setup ~/.bash_profile
echo export NODE_PATH=\"/usr/local/lib/node_modules\" >> ~/.bash_profile

cat << __end
Install the ssh public key of source PC/Mac to ~/.ssh/authorized_keys
scp <SSH public key of source PC/Mac> $BOTNAME@zbwajsbotNN:~/srcpubkey
ssh $BOTNAME@zbwajsbotNN "cat ~/srcpubkey >> ~/.ssh/authorized_keys"

Copy source files to the server NN (NN is a number) to this server by running
these commands on the source PC/Mac:
scp start_wabot.sh $BOTNAME@zbwajsbotNN:~/wajs
scp index.js $BOTNAME@zbwajsbotNN:~/wajs
scp wabot.js $BOTNAME@zbwajsbotNN:~/wajs
__end
