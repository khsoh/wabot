#!/bin/bash

# This should be run by zbpabot user just after executing setup_root.sh as root

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
scp <SSH public key of source PC/Mac> zbpabot@zbwajsbotNN:~/srcpubkey
ssh zbpabot@zbwajsbotNN "cat ~/srcpubkey >> ~/.ssh/authorized_keys"

Copy source files to the server NN (NN is a number) to this server by running
these commands on the source PC/Mac:
scp start_wabot.sh zbpabot@zbwajsbotNN:~/wajs
scp index.js zbpabot@zbwajsbotNN:~/wajs
scp wabot.js zbpabot@zbwajsbotNN:~/wajs
__end
