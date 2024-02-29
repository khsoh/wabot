# Setting up WhatsApp bot app to communicate with a Google App Script Web App

The purpose of this document is to show how to setup a WhatsApp bot on a Kamatera server to communicate with a Google App Script Web App.  The Web App is NOT part of this repository and will only be known to technical leads of this project.

The source code of the bot is publicly available but the `botconfig.json` file is secret.  A demo version of this file (`botconfig-demo.json`) is available in this repository.

## Creating the server on Kamatera:

### Phase 1: Clone the repository to your local PC/Mac first
1. Execute the following command to clone the directory to your local PC first
```
    git clone https://github.com/khsoh/wabot.git ~/wabot
```

### Phase 2: Edit botconfig.json to prepare the bot(s)
1. Copy `botconfig-demo.json` file in the `wabot` project to `botconfig.json` and edit the relevant fields to ensure that your bot can communicate with the Google App Script Web App properly.  The likely fields you need to change for a new deployment are:
  - GASURL
  - BOT_SECRET
  - SERVER_PORT
2. Additional backup bot deployments must use the same JSON file.


### Phase 3: Create the server(s)
1. Create New Service: node.js (use LTS version - this is 16 as of 27 Aug 2022)
2. Server specs: A1, 1G RAM, 15 GB SSD
3. Public Internet
NOTE: image name: `service_nodejs_nodejs-16-ubuntuserver-20.04`
4. Add name of server (`zbwajsbot<NN>`) to hosts file of local PC/Mac

### Phase 4: Installing OpenSSH or PuTTY on local PC/Mac

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
    cd ~/wabot
    scp setup_root.sh root@zbwajsbot<NN>:~
    scp botconfig.json root@zbwajsbot<NN>:~
    ssh root@zbwajsbot<NN> "/bin/bash ~/setup_root.sh"
```

### Phase 5: Install SSH public key of source PC/Mac
1. Copy SSH public key of source PC/Mac to server
```
    scp <SSH public key of source PC/Mac> <botconfig.NAME>@zbwajsbot<NN>:~/srcpubkey
    ssh <botconfig.NAME>@zbwajsbot<NN> "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
```

The last command appends the public key to the SSH server's authorized_keys file so that you do not need to enter a password everytime you use `scp` or `pscp` to copy files to the server.

### Phase 6: Setup user <botconfig.NAME>
1. Run the following commands on the local/PC MAC to prepare the `<botconfig.NAME>` user account.
```
    ssh <botconfig.NAME>@zbwajsbot<NN> "git clone https://github.com/khsoh/wabot.git ~/wabot"
    scp ~/wabot/botconfig.json <botconfig.NAME>@zbwajsbot<NN>:~/wabot
    ssh <botconfig.NAME>@zbwajsbot<NN> "/bin/bash ~/wabot/setup_before_wabot.sh"
    ssh <botconfig.NAME>@zbwajsbot<NN> "/bin/bash ~/wabot/setup_after_wabot.sh"
```

