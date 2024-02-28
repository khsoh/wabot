# Setting up WhatsApp bot app to communicate with a Google App Script Web App

The purpose of this document is to show how to setup a WhatsApp bot on a Kamatera server to communicate with a Google App Script Web App.  The Web App is NOT part of this repository and will only be known to technical leads of this project.

The source code of the bot is publicly available but the `botconfig.json` file is secret.  A demo version of this file (`botconfig-demo.json`) is available in this repository.

## Creating the server on Kamatera:

### Phase 1: Create the server
1. Create New Service: node.js (use LTS version - this is 16 as of 27 Aug 2022)
2. Server specs: A1, 1G RAM, 15 GB SSD
3. Public Internet
NOTE: image name: `service_nodejs_nodejs-16-ubuntuserver-20.04`
4. Add name of server (`zbwajsbot<NN>`) to hosts file of local PC/Mac

### Phase 2: Edit botconfig.json to prepare the bot
1. Edit `botconfig.json` to edit the relevant fields to ensure that your bot can communicate with the Google App Script Web App properly.  The likely fields you need to change for a new deployment are:
  - GASURL
  - BOT_SECRET
  - SERVER_PORT
2. Additional backup bot deployments must use the same JSON file.

### Phase 3: Installing OpenSSH or PuTTY on local PC/Mac

We will use SSH to securely copy files from our PC/Mac to the server.  Firstly, install OpenSSH or 
PuTTY (for Windows PC).  Read the relevant documentation in these tools to generate you private/public
key pair.

Note that the commands to copy files securely are:

1. Copying from a Mac (or Windows PC with OpenSSH installed):
`  scp <source_file> <botconfig.NAME>@zbwajsbot<NN>:<destination_folder>`

2. Copying from Windows PC with PuTTY installed:
`  pscp <source_file> <botconfig.NAME>@zbwajsbot<NN>:<destination folder>`


### Phase 4: Copy setup_root.sh and botconfig.json to server and execute the script
1. Copy setup_root.sh and botconfig.json over SSH:
```
    scp setup_root.sh root@zbwajsbot<NN>:~
    scp botconfig.json root@zbwajsbot<NN>:~
    ssh root@zbwajsbot<NN> /bin/bash ~/setup_root.sh
```

### Phase 5: Setup user <botconfig.NAME>
1. Copy setup_before_wajs.sh over SSH:
```
    scp setup_before_wajs.sh <botconfig.NAME>@zbwajsbot<NN>:~
    ssh <botconfig.NAME>@zbwajsbot<NN> /bin/bash ~/setup_before_wajs.sh
```

### Phase 6: Install SSH public key of source PC/Mac
1. Copy SSH public key of source PC/Mac to server
```
    scp <SSH public key of source PC/Mac> <botconfig.NAME>@zbwajsbot<NN>:~/srcpubkey
    ssh <botconfig.NAME>@zbwajsbot<NN> "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
```

The last command appends the public key to the SSH server's authorized_keys file so that you do not need to enter a password everytime you use `scp` or `pscp` to copy files to the server.

### Phase 7: Install source files of wajs:
1. Copy the source files:
```
    scp start_wabot.sh <botconfig.NAME>@zbwajsbot<NN>:~/wajs
    scp index.js <botconfig.NAME>@zbwajsbot<NN>:~/wajs
    scp wabot.js <botconfig.NAME>@zbwajsbot<NN>:~/wajs
    scp setup_after_wajs.sh <botconfig.NAME>@zbwajsbot<NN>:~
```
2. Execute the setup
```
    ssh <botconfig.NAME>@zbwajsbot<NN> "/bin/bash setup_after_wajs.sh"
```

