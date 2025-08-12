#!/usr/bin/env bash
# This should be run by root user when server is first created

SCRIPTPATH="$( cd -- "$(dirname "$BASH_SOURCE[0]")" >/dev/null 2>&1 ; pwd -P )"
CFGJSON="$SCRIPTPATH/botconfig.json"
BOTNAME="$(node -e "console.log(require('$CFGJSON').NAME)")"

# Add user $BOTNAME and allow him sudoer rights
adduser $BOTNAME
usermod -aG sudo $BOTNAME

(crontab -l ; cat << _end_of_crontab
0 1 * * * test `npm outdated -g|wc -l` -gt 0 && npm update -g
_end_of_crontab
) | crontab -

# Open firewall for server port
ufw allow `node -e "console.log(require('$CFGJSON').SERVER_PORT)"`

# allow $BOTNAME to execute reboot
if [ ! -d /etc/sudoers.d ]; then
  mkdir /etc/sudoers.d
  chmod 755 /etc/sudoers.d
fi
echo "$BOTNAME ALL=NOPASSWD: /sbin/reboot" > /etc/sudoers.d/01_reboot
chmod 440 /etc/sudoers.d/01_reboot

# Install packages required to run whatsapp-web.js on no-gui systems
# Reference: https://wwebjs.dev/guide/#installation-on-no-gui-systems
apt install -y dconf-service libgbm-dev libasound2t64 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator3-1 libnss3 lsb-release xdg-utils wget

