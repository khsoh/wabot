#!/usr/bin/env bash
# This should be run by root user when server is first created

SCRIPTPATH="$(
    cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 || exit
    pwd -P
)"
CFGENV="$SCRIPTPATH/.env"

BOTNAME=$(grep -v '^#' "${CFGENV}" | grep 'NAME=' | cut -d '=' -f2- | sed 's/^"//;s/"$//')
SERVER_PORT=$(grep -v '^#' "${CFGENV}" | grep 'SERVER_PORT=' | cut -d '=' -f2- | sed 's/^"//;s/"$//')
SIGNALSTR=$(grep -v '^#' "${CFGENV}" | grep 'SIGNAL=' | cut -d '=' -f2- | sed "s/^'//;s/'$//")

SIGNALPHONE="$(node -e 'console.log(JSON.parse(process.argv[1]).PHONE)' "$SIGNALSTR")"
SIGNALPORT="$(node -e 'console.log(JSON.parse(process.argv[1]).PORT)' "$SIGNALSTR")"

# Add user $BOTNAME and allow him sudoer rights
adduser "$BOTNAME"
usermod -aG sudo "$BOTNAME"

(
    crontab -l
    cat <<_end_of_crontab
0 1 * * * test $(npm outdated -g | wc -l) -gt 0 && npm update -g
_end_of_crontab
) | crontab -

# Open firewall for server port
ufw allow "$SERVER_PORT"

# allow $BOTNAME to execute reboot
if [ ! -d /etc/sudoers.d ]; then
    mkdir /etc/sudoers.d
    chmod 755 /etc/sudoers.d
fi
echo "$BOTNAME ALL=NOPASSWD: /sbin/reboot" >/etc/sudoers.d/01_reboot
chmod 440 /etc/sudoers.d/01_reboot

# Install packages required to run whatsapp-web.js on no-gui systems
# Reference: https://wwebjs.dev/guide/#installation-on-no-gui-systems
apt install -y dconf-service libgbm-dev libasound2t64 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator3-1 libnss3 lsb-release xdg-utils wget certbot openjdk-25-jre-headless qrencode

## COMMENTED OUT CODE TO INSTALL dotenvx to manage secrets
## curl -fsS https://dotenvx.sh/install.sh | sh
# SECRETSDIR=/etc/envsecrets
# SECRETSENV=$SECRETSDIR/secrets.env
# mkdir -p $SECRETSDIR
# chmod 700 $SECRETSDIR
# chown root:root $SECRETSDIR
# touch $SECRETSENV
# chown root:root $SECRETSENV
# chmod 600 $SECRETSENV
# echo "Put your DOTENV_PRIVATE_KEY_PRODUCTION private key in $SECRETSDIR/secrets.env"

## END

sudo -u "$BOTNAME" ssh-keygen -t ed25519

# JVM build (requires JRE >= 25)
VERSION=$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AsamK/signal-cli/releases/latest | sed -e 's/^.*\/v//')
curl -L -O https://github.com/AsamK/signal-cli/releases/download/v"${VERSION}"/signal-cli-"${VERSION}".tar.gz
sudo tar xf signal-cli-"${VERSION}".tar.gz -C /opt
sudo ln -sf /opt/signal-cli-"${VERSION}"/bin/signal-cli /usr/local/bin/
rm "./signal-cli-${VERSION}.tar.gz"

cat <<EOF >/etc/systemd/system/signal-cli.service
[Unit]
Description=Signal CLI JSON-RPC Daemon
After=network.target

[Service]
Type=simple
# Run under a non-root user for security
User=zbpabot

# Ensure the environment knows where your signal-cli binary is if it's not in /usr/bin
Environment=PATH=/usr/local/bin:/usr/bin:/bin

# Adjust your active registration phone number and configuration path
ExecStart=/usr/local/bin/signal-cli --config /home/zbpabot/.local/share/signal-cli -a $SIGNALPHONE daemon --tcp 127.0.0.1:$SIGNALPORT

Restart=always
RestartSec=5

# Keeps logs tidy in journald
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

EOF

systemctl enable signal-cli.service
systemctl daemon-reload
