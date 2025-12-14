#!/usr/bin/env bash
# This should be run by root user when server is first created
# Run this only about 24-48 hours after creating public DNS record of host

SCRIPTNAME=$(readlink -f "$0")
SCRIPTDIR=$(dirname "$SCRIPTNAME")

if [ -n "$1" ]; then
    EMAIL_ADDRESS="$1"
else
    echo -n "Please enter email address: "
    read EMAIL_ADDRESS
fi

BOTDIR=$HOME/.config/botcert
if [ ! -d "$BOTDIR" ]; then
    mkdir -p $BOTDIR
fi
BOTUSER=$(whoami)
FULLHOST=$(hostname).$(cat $SCRIPTDIR/botconfig.json | jq -r ".DOMAIN")

sudo -s <<EOF
# Temporarily open up firewall
ufw allow 80
ufw allow 443


cleanup() {
    ufw delete allow 80
    ufw delete allow 443
}
trap cleanup EXIT INT QUIT TERM

certbot certonly \
    --standalone \
    --non-interactive \
    --email $EMAIL_ADDRESS \
    --agree-tos \
    -d ${FULLHOST}

if [[ \$? -ne 0 ]]; then
    exit
fi

cat <<EOF1 >/etc/letsencrypt/renewal-hooks/deploy/10-copy-certs.sh
#!/usr/bin/env bash
DOMAIN=${FULLHOST}
BOTDIR=${BOTDIR}

cp /etc/letsencrypt/live/\\\$DOMAIN/{fullchain,privkey}.pem "\\\$BOTDIR"
chown $BOTUSER:$BOTUSER "\\\$BOTDIR"/*.pem
chmod 600 "\\\$BOTDIR"/privkey.pem
chmod 644 "\\\$BOTDIR"/fullchain.pem

EOF1

chmod +x /etc/letsencrypt/renewal-hooks/deploy/10-copy-certs.sh
/etc/letsencrypt/renewal-hooks/deploy/10-copy-certs.sh

EOF

