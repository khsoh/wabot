# Setting up WhatsApp bot app to communicate with a Google App Script Web App

The purpose of this document is to show how to setup a WhatsApp bot on a server on the 
[Kamatera cloud provider](https://www.kamatera.com) to communicate with a Google App Script Web App.  The Web App 
is NOT part of this repository and will only be known to technical leads of this project.

The source code of the bot is publicly available but the `botconfig.json` file is secret.  
A demo version of this file (`botconfig-demo.json`) is available in this repository.

## Setting up the bot server on [Kamatera](https://www.kamatera.com):

### Phase 1: Clone the repository to your local PC/Mac first
1. Execute the following command to clone the directory to your local PC first
```
    git clone https://github.com/khsoh/wabot.git [optional user-specified bot directory]
```

NOTE: For the purpose of the rest of this README.md, we will assume the cloned repository 
on both the local PC/Mac AND the remote server is on `wabot` subdirectory of the home 
folder (~ on Unix-based systems or %USERPROFILE% on Windows systems).  The setup scripts
and execution scripts are designed to be independent of the name of the cloned subdirectory.

### Phase 2: Edit botconfig.json to prepare the bot(s)
1. Copy `botconfig-demo.json` file in the `wabot` project to `botconfig.json` and edit the 
relevant fields to ensure that your bot can effectively communicate with the deployed Google 
App Script Web App.  The fields you likely need to change for a new deployment are:
  - NAME
  - GASURL
  - BOT_SECRET
  - SERVER_PORT

***For purpose of discussion, we will assume the NAME field is wademobot.  This will also be
name of the user account***

2. Additional backup bot server deployments must use the same JSON file.

### Phase 3: Create the server(s) on the [Kamatera cloud provider](https://www.kamatera.com)
1. Log in to your Kamatera cloud account.
2. Click on `Create New Service`.
3. Select a zone from **Choose Zone**
4. Select `node.js` (use LTS version - this is 16 as of 27 Aug 2022) from **Choose Service**
5. From **Choose Server Specs**, select these specs: Type A, 1 CPU, 1G RAM, 15 GB SSD
6. Select `Public Internet` from **Choose Networking**
7. Complete your setup in **Finalize Settings** by choosing your password, selecting
the number of servers and naming your servers.  ***For purpose of discussion in the rest of 
this document, we assume the server is named*** `wajsbot01`.
8. Add name of server (`wajsbot01`) to hosts file of local PC/Mac.  On Mac, this text file
is in `/etc/hosts` directory.  On Windows, this file is in `c:\Windows\System32\Drivers\etc\hosts`.

### Phase 4: Installing OpenSSH or PuTTY on local PC/Mac

1. We will use SSH to securely copy files from our PC/Mac to the server.  Firstly, install OpenSSH:

- For Windows systems, you only need to install the client: [OpenSSH for Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse?tabs=gui#install-openssh-for-windows).  
- For Mac systems, OpenSSH is already pre-installed.

2. Generate your private/public keypair by executing this command:
```
    ssh-keygen -t ed25519
```

Windows provides good documentation on this process [here](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement#user-key-generation).  **Do not enter a password for this keypair when you create it**.

Private key file `id_ed25519` and public key file `id_ed25519.pub` are generated and saved in these locations:

- Windows: `%USERPROFILE%\.ssh` folder
- Mac: `$HOME/.ssh` folder


### Phase 5: Copy setup_root.sh and botconfig.json to server and execute the script


***We will use Mac as the default local platform for the rest of the discussion.  Mac
uses environment variable `$HOME` or shortcut `~` to reference the home directory; 
while Windows uses the environment variable `%USERPROFILE%`***

1. Copy setup_root.sh and botconfig.json over SSH:
```
    cd ~/wabot
    scp setup_root.sh root@wajsbot01:~
    scp botconfig.json root@wajsbot01:~
    ssh root@wajsbot01 "/bin/bash ~/setup_root.sh"
```

Note that you will be prompted to enter the root password of the server each time you execute
`scp` or `ssh` command to the root user of the server.

The `setup_root.sh` script will create the user account for `wademobot` (or whatever NAME
field you assigned in the `botconfig.json` file - and you will be prompted to create the 
password for this user account.  **Please remember this password for the next phase of 
this setup**.


### Phase 5: Install SSH public key of source PC/Mac
1. Copy SSH public key of source PC/Mac to server
```
    scp ~/.ssh/id_ed25519.pub wademobot@wajsbot01:~/srcpubkey
    ssh wademobot@wajsbot01 "cat ~/srcpubkey >> ~/.ssh/authorized_keys"
```

Note that you will be prompted to enter the password of the `wademobot` user each time you execute
`scp` or `ssh` command to the root user of the server.

The last command appends the public key to the SSH server's authorized_keys file so that you 
will not need to enter a password everytime you use `scp` or `ssh` commands to communicate with the
`wademobot` account of the server.


### Phase 6: Setup user `wademobot`
1. Run the following commands on the local/PC MAC to prepare the `wademobot` user account.
```
    ssh wademobot@wajsbot01 "git clone https://github.com/khsoh/wabot.git ~/wabot"
    scp ~/wabot/botconfig.json wademobot@wajsbot01:~/wabot
    ssh wademobot@wajsbot01 "/bin/bash ~/wabot/setup_before_wabot.sh"
```

2. After the last command, you will see a message asking you to copy your public key file
(`id_ed25519.pub`) to the server.  This is not automatic - just follow the steps as 
indicated in the message.


3. Finally run the final script to complete the setup.
```
    ssh wademobot@wajsbot01 "/bin/bash ~/wabot/setup_after_wabot.sh"
```

You should prepare your WhatsApp application on your phone to scan the QR code to link the 
account to the server.

