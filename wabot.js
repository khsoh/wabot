const { https } = require('follow-redirects');
const QRCode = require('qrcode');
var os = require('os');
const util = require('util');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { NodeCache } = require('@cacheable/node-cache');
const DEFAULT_CACHE_TIMEOUT = 30;
const sessionCache = new NodeCache({
    checkperiod: DEFAULT_CACHE_TIMEOUT
});
const nonceCache = new NodeCache({
    checkperiod: DEFAULT_CACHE_TIMEOUT
});
sessionCache.on('expired', session_expired);
sessionCache.on('del', session_deleted);
nonceCache.on('expired', nonce_expired);
nonceCache.on('set', nonce_set);

const { stdout, stderr } = require('process');
const BOTCONFIG = require('./botconfig.json');
const DEMOCONFIG = require('./botconfig-demo.json');

const packageInfo = require('./package.json');
const installedInfo = require('./package-lock.json');


const nets = os.networkInterfaces();

const BOT_ACTIVE = "ACTIVE";
const BOT_SLEEP = "SLEEP";
const BOT_OFF = "OFF";

const CLIENT_OFF = "OFF";
const CLIENT_STARTING = "STARTING";
const CLIENT_READY = "READY";
var CLIENT_STATE = CLIENT_OFF;

const VALIDITY_WINDOW_SECONDS = 60;
const SESSION_TIMEOUT_SECONDS = 30;


const requireUncached = module => {
    delete require.cache[require.resolve(module)];
    return require(module);
};

var BOTINFO = {
    HOSTNAME: os.hostname(),
    IPADDR: Object.values(nets).map((v) => v.filter(x => !x.internal && x.family == 'IPv4')).flat().map(v => v.address)[0],
    STATE: BOT_OFF,
};
BOTINFO.IPURL = `http://${BOTINFO.IPADDR}:${BOTCONFIG.SERVER_PORT}/`;
BOTINFO.HOSTURL = `https://${BOTINFO.HOSTNAME}.${BOTCONFIG.DOMAIN}:${BOTCONFIG.SERVER_PORT}/`;

var first_ready_received = false;
var WEBAPPSTATE_OK = true;

function gentsdate(epochTime, override_opts = {
}) {
    const options = {
        ...{
            day: '2-digit',
            year: 'numeric',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            fractionalSecondDigits: 3,
            timeZoneName: 'long',
            timeZone: 'Asia/Singapore'
        }, ...override_opts
    };
    const dtf = new Intl.DateTimeFormat('en-us', options);
    const pt = dtf.formatToParts(epochTime);
    const p = pt.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond} ${p.timeZoneName}`;
}

class TConsole extends console.Console {
    constructor(...args) {
        super(...args);
        this.tslog_tz = 'Asia/Singapore';
    }
    set_tz(tz) {
        this.tslog_tz = tz;
    }
    tsdate() {
        return gentsdate(Date.now(), { timeZoneName: 'short' });
    }
    log(data, ...args) {
        super.log(`${this.tsdate()} --- `, util.format(data, ...args));
    }
    warn(data, ...args) {
        super.warn(`${this.tsdate()} :::WARN::: `, util.format(data, ...args));
    }
    error(data, ...args) {
        super.error(`${this.tsdate()} ###ERROR### `, util.format(data, ...args));
    }
}
const dtcon = new TConsole({ stdout, stderr });
dtcon.set_tz('Asia/Singapore');

process.on('uncaughtException', (err) => {
    dtcon.error('Caught Exception at Line:', err.stack.split("\n")[1]);
    process.exit(1);
});

// === The following is for testing the handling of Uncaught Exception
// setTimeout(() => {
//     throw new Error('Test: Synchronous Uncaught Exception');
// }, 100);

process.on('unhandledRejection', (reason, promise) => {
    // Print out stack for an Error object
    if (reason instanceof Error) {
        dtcon.error(`Unhandled Rejection Stack: ${reason.stack}`);
    } else {
        dtcon.error(`Unhandled Rejection (no stack): ${reason}`);
    }
    process.exit(1);
});

// === The following is for testing the handling of unhandledRejection
// Promise.reject(new Error('Triggering unhandledRejection test'));


// Perform security check on botconfig.json to ensure that users select
// different parameters for GASURL, BOT_SECRET and SERVER_PORT
var botconfig_ok = true;
if (BOTCONFIG.GASURL == DEMOCONFIG.GASURL) {
    dtcon.error("GASURL in botconfig.json must be different from botconfig-demo.json");
    botconfig_ok = false;
}
if (BOTCONFIG.BOT_SECRET == DEMOCONFIG.BOT_SECRET) {
    dtcon.error("BOT_SECRET in botconfig.json must be different from botconfig-demo.json");
    botconfig_ok = false;
}
if (BOTCONFIG.SERVER_PORT == DEMOCONFIG.SERVER_PORT) {
    dtcon.error("SERVER_PORT in botconfig.json must be different from botconfig-demo.json");
    botconfig_ok = false;
}

if (!botconfig_ok) {
    process.exit(1);
}

// Computing the cached versions of chromium downloaded by puppeteer
var chromium_versions = {
    'chrome': [],
    'chrome-headless-shell': []
};

const puppeteer_cache = process.env.HOME + "/.cache/puppeteer/";

if (!fs.existsSync(puppeteer_cache)) {
    dtcon.error(`${puppeteer_cache} does not exists`);
}
else {
    let rgx = new RegExp('^linux-(?<major>\\d+)\.(?<minor>\\d+)\.(?<build>\\d+)\.(?<patch>\\d+)$');

    for (const key of Object.keys(chromium_versions)) {
        dtcon.log(`Parsing ${key}`);
        let folder = puppeteer_cache + key;
        let files = fs.readdirSync(folder);
        if (files && files.length > 0) {
            files.forEach(file => {
                let m = rgx.exec(file);
                if (m) {
                    chromium_versions[key].push({
                        name: file,
                        version: {
                            major: parseInt(m.groups.major),
                            minor: parseInt(m.groups.minor),
                            build: parseInt(m.groups.build),
                            patch: parseInt(m.groups.patch)
                        }
                    });
                }
                else {
                    dtcon.log(`Not chrome directory - ${file}`);
                }
            });
        } else {
            dtcon.log(`Nothing found in ${folder}`);
        }

        chromium_versions[key].sort((a, b) =>
            a.version.major != b.version.major ? b.version.major - a.version.major :
                a.version.minor != b.version.minor ? b.version.minor - a.version.minor :
                    a.version.build != b.version.build ? b.version.build - a.version.build :
                        b.version.patch - a.version.patch
        );
    }
}

const CS_LOCKED = 1;
const CS_UNLOCKED = 0;
const CS_NUMLOCKS = 4;
var smb = new SharedArrayBuffer(4 * CS_NUMLOCKS);
var slock = new Int32Array(smb).fill(CS_UNLOCKED);
async function EnterCriticalSection(i, timeout = 60000) {
    dtcon.log(`ENTER CRITICALSECTION ${i} - Initial ATOMICS value ${Atomics.load(slock, i)}`);
    var w = "ok";
    if (Atomics.compareExchange(slock, i, CS_UNLOCKED, CS_LOCKED) !== CS_UNLOCKED) {
        w = Atomics.wait(slock, i, CS_LOCKED, timeout);
        dtcon.log(`Atomics wait of ${i} returned ${w} - value ${Atomics.load(slock, i)}`);
        if (Atomics.compareExchange(slock, i, CS_UNLOCKED, CS_LOCKED) == CS_UNLOCKED) {
            w = "ok";
        }
    }
    dtcon.log(`COMPLETED ENTER CRITICALSECTION ${i}.  Stored ATOMICS value ${Atomics.load(slock, i)}`);
    if (w != "ok") {
        let errmsg = `Timed out waiting in EnterCriticalSection ${i}`;
        dtcon.error(errmsg);
        throw new Error(errmsg);
    }
}

async function LeaveCriticalSection(i) {
    dtcon.log(`LEAVE CRITICALSECTION ${i} - Initial ATOMICS value ${Atomics.load(slock, i)}`);
    // Ensures that this is safe to call when the section is already unlocked
    if (Atomics.compareExchange(slock, i, CS_LOCKED, CS_LOCKED) == CS_LOCKED) {
        dtcon.log(`CLEARING CRITICALSECTION.  BEFORE CLEARING, ATOMICS value was ${Atomics.load(slock, i)}`);
        Atomics.store(slock, i, CS_UNLOCKED);
        Atomics.notify(slock, i, 1);
    }
    dtcon.log(`COMPLETED LEAVING CRITICALSECTION ${i}`);
}


function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

async function bare_reboot() {
    const {
        exec
    } = require("child_process");

    exec('"/usr/bin/sudo" /sbin/reboot', (error, stdout, stderr) => { dtcon.log(error, stdout, stderr); });
}

async function reboot(close_server = false) {
    BOTINFO.STATE = BOT_OFF;
    CLIENT_STATE = CLIENT_OFF;
    // await client.destroy();
    await destroyClient();
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    await EnterCriticalSection(1);
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
        clientStartTimeoutObject = null;
    }
    await LeaveCriticalSection(1);
    if (close_server) {
        clearInterval(monitorServerTimer);
        server.close(bare_reboot);
    }
    else {
        bare_reboot();
    }
}

async function client_logout() {
    BOTINFO.STATE = BOT_OFF;
    CLIENT_STATE = CLIENT_OFF;
    await client.logout();
    // await client.destroy();
    await destroyClient();
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    await EnterCriticalSection(1);
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
        clientStartTimeoutObject = null;
    }
    await LeaveCriticalSection(1);
    if (monitorServerTimer) {
        clearInterval(monitorServerTimer);
    }
    server.close(() => {
        process.exit(0);
    });
}

const { Client, Poll, LocalAuth, Message, MessageMedia, WAState, MessageTypes, Events } = require('./index');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "." }),
    deviceName: BOTINFO.HOSTNAME,
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--log-level=3',
        ]
    },
    authTimeoutMs: 4 * 60 * 1000,
    qrMaxRetries: 5,
    ... (BOTCONFIG?.PHONE && {
        pairWithPhoneNumber: {
            phoneNumber: BOTCONFIG.PHONE,
            showNotification: true,
        }
    }),
    /**
     *  Added webVersion and webVersionCache to resolve these issues:
     *      https://github.com/pedroslopez/whatsapp-web.js/issues/5718
     */
    ... (BOTCONFIG?.WAVERSION &&
    {
        webVersion: BOTCONFIG.WAVERSION,
        webVersionCache: {
            type: "remote",
            remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/{version}-alpha.html"
        }
    })
});

/***
const client = new Client({
    authStrategy: new LocalAuth()
});
*/

// A function to test if client is logged in by getting 
// contact for itself
async function clientLoggedIn() {
    try {
        let cstate = await client.getState();
        dtcon.log(`clientLoggedIn: state is ${cstate}`);
        return cstate == WAState.CONNECTED;
    } catch (e) {
        dtcon.error(`clientLoggedIn: Failed to get state for client:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
        return false;
    }
}

async function convertXidtoPn(xid) {
    if (!xid.endsWith("@lid")) {
        return xid;
    }
    let userinfo = await client.getContactLidAndPhone(xid);
    if (userinfo.length == 0) {
        dtcon.error(`Cannot find LID contact information for ${xid}`);
        return;
    }
    dtcon.log(`LID userinfo: ${JSON.stringify(userinfo, null, 2)}`);
    return userinfo[0].pn;
}

client.on(Events.DISCONNECTED, async (reason) => {
    dtcon.log(`!!!!!!Event: Client was disconnected: ${reason}`);
    BOTINFO.STATE = BOT_OFF;
    CLIENT_STATE = CLIENT_OFF;
    first_ready_received = false;
    try {
        let cstate = await client.getState();
        dtcon.log(`Received DISCONNECTED event: state is ${cstate}`);
    } catch (e) {
        dtcon.error(`DISCONNECTED: Failed to get state for client:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
    }
    if (clientAuthenticatedTimeout) {
        clearTimeout(clientAuthenticatedTimeout);
        clientAuthenticatedTimeout = null;
        dtcon.log("Removed scheduled handling of client AUTHENTICATED event");
    }

    await cmd_to_host(BOTCONFIG.TECHLEAD, reason, [], 'disconnected', false);
    dtcon.log("!!!!!!Completed sending disconnect event to host");

    try {
        // await client.destroy();     // Destroy client when it is disconnected
        await destroyClient();
    } catch (e) {
        dtcon.error(`Failed to destroy client while handling disconnected event:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
    }
    dtcon.log("!!!!!!Disconnected event: Completed destroy client");

    // Set state sleep here AFTER cmd_to_host - we want to host to wake another bot
    if (reason === "LOGOUT") {
        // restart client
        setImmediate(startClient);
        return;
    }
    if (monitorClientTimer) {
        clearInterval(monitorClientTimer);
    }
    await EnterCriticalSection(1);
    if (clientStartTimeoutObject) {
        clearTimeout(clientStartTimeoutObject);
        clientStartTimeoutObject = null;
    }
    await LeaveCriticalSection(1);
    if (monitorServerTimer) {
        clearInterval(monitorServerTimer);
    }
    server.close(() => {
        process.exit(0);
    });
});

client.on(Events.CODE_RECEIVED, async (code) => {
    dtcon.log('Event: Linking code received', code);
    let authreq = {
        pairingCode: code
    };
    first_ready_received = false;
    await cmd_to_host(BOTCONFIG.TECHLEAD, authreq, [], 'code', false);
});

client.on(Events.QR_RECEIVED, async (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    dtcon.log(`Event: QR RECEIVED ${qr}`);
    dtcon.log(`CLIENT_STATE: ${CLIENT_STATE}`);

    if (CLIENT_STATE != CLIENT_STARTING) {
        dtcon.error(`Ignore QR code because client state is ${CLIENT_STATE}`);
        return;
    }
    let qrstr = await QRCode.toDataURL(qr);
    let authreq = {
        qrImage: qrstr,
    };
    first_ready_received = false;
    await cmd_to_host(BOTCONFIG.TECHLEAD, authreq, [], 'qr', false);
});

var clientAuthenticatedTimeout = null;
async function client_authenticated() {
    dtcon.log('Event: AUTHENTICATED');
    dtcon.log(`CLIENT_STATE: ${CLIENT_STATE}`);
    clientAuthenticatedTimeout = null;
    if (!await clientLoggedIn()) {
        dtcon.error("AUTHENTICATED: client not logged in - skip returning event to host");
        return;
    }
    await cmd_to_host(BOTCONFIG.TECHLEAD, "", [], 'authenticated', false);
}

client.on(Events.AUTHENTICATED, async () => {
    if (!clientAuthenticatedTimeout) {
        dtcon.log("SCHEDULE handling AUTHENTICATED event");
        clientAuthenticatedTimeout = setTimeout(client_authenticated, 1500);
    }
});

client.on(Events.AUTHENTICATION_FAILURE, async msg => {
    // Fired if session restore was unsuccessful
    dtcon.error(`Event: AUTHENTICATION FAILURE - ${msg}`);
    await cmd_to_host(BOTCONFIG.TECHLEAD, msg, [], 'auth_failure', false);
});

client.on(Events.VOTE_UPDATE, async (vote) => {
    dtcon.log("Processing vote_update event...");
    dtcon.log(vote);

    // The following is required to work around bug in polls sent by
    // bot - the sending bot cannot see the vote_update event
    // let bot_active = !vote.parentMsgKey._serialized.includes('@g.us');
    // await cmd_to_host(BOTCONFIG.TECHLEAD, vote, [], 'vote_update', bot_active);
    await cmd_to_host(BOTCONFIG.TECHLEAD, vote, [], 'vote_update', false);
});

var clientReadyTimeout = null;
async function client_ready() {
    dtcon.log('Event: READY');
    dtcon.log(`CLIENT_STATE: ${CLIENT_STATE}`);
    clientReadyTimeout = null;

    // Test if client is logged in
    if (!await clientLoggedIn()) {
        dtcon.error("READY event: client is not logged in - skip returning event");
        return;
    }

    let prevwwebfs = './lastUsedwwebver.json';
    let version = "UNKNOWN";
    let messages = [];
    let active_chromium_version = {
        major: 0,
        minor: 0,
        build: 0,
        patch: 0,
        valid: false
    };

    const prevwweb = fs.existsSync(prevwwebfs) ? requireUncached(prevwwebfs) : { version: "" };

    // Get WhatsApp-Web version
    try {
        version = await client.getWWebVersion();
        dtcon.log(`WhatsApp Web version: ${version}`);
    } catch (e) {
        dtcon.error(`WhatsApp Web version failed:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
    }

    dtcon.log("Dependencies: ");
    messages.push(`*${BOTINFO.HOSTNAME}* is ready`);
    messages.push(`Current WhatsApp Web version: ${version}`);
    if (version != prevwweb.version) {
        if (prevwweb.version) {
            messages.push(`WhatsApp Web version has been updated from old version ${prevwweb.version}`);
        }
        if (version !== "UNKNOWN") {
            fs.writeFileSync(prevwwebfs, JSON.stringify({ version: version }, null, 2));
        }
    }
    BOTINFO['VERSION'] = version;

    if (!first_ready_received) {
        // Get the active Chromium version
        BOTINFO['BROWSER_VERSION'] = "UNKNOWN";
        try {
            let browser_version = await client.pupBrowser.version();
            messages.push(`Browser version in use: ${browser_version}\n`);
            BOTINFO['BROWSER_VERSION'] = browser_version;

            let rgx = new RegExp('(?<major>\\d+)\.(?<minor>\\d+)\.(?<build>\\d+)\.(?<patch>\\d+)');
            let m = rgx.exec(browser_version);
            if (m) {
                active_chromium_version.major = parseInt(m.groups.major);
                active_chromium_version.minor = parseInt(m.groups.minor);
                active_chromium_version.build = parseInt(m.groups.build);
                active_chromium_version.patch = parseInt(m.groups.patch);
                active_chromium_version.valid = true;
            }
        } catch (_) {
            messages.push("Could not detect browser version\n");
        }


        // Get NPM dependencies
        for (let [software, _] of Object.entries(packageInfo.dependencies)) {
            let installedVersion = installedInfo.packages[`node_modules/${software}`].version;
            let resolved = installedInfo.packages[`node_modules/${software}`].resolved;
            let vmsg = `  ${software}: ${installedVersion}`;
            messages.push(vmsg);
            if (resolved && !resolved.startsWith("https://registry.npmjs.org")) {
                messages.push(`  --- ${resolved}`);
            }
            dtcon.log(vmsg);
        }

        for (const chtype of Object.keys(chromium_versions)) {
            if (chromium_versions[chtype].length == 0) {
                messages.push(`No chromium version cached for ${chtype}`);
            }
            else {
                messages.push(`\nCached chromium installed for ${chtype}`);
                let outdated_versions = false;
                const asterisk = "*";
                chromium_versions[chtype].forEach(c => {
                    let outdated = active_chromium_version.valid && (
                        active_chromium_version.major != c.version.major ?
                            active_chromium_version.major > c.version.major :
                            active_chromium_version.minor != c.version.minor ?
                                active_chromium_version.minor > c.version.minor :
                                active_chromium_version.build != c.version.build ?
                                    active_chromium_version.build > c.version.build :
                                    active_chromium_version.patch > c.version.patch);
                    outdated_versions ||= outdated;

                    messages.push(`  ${outdated ? asterisk : ""}${c.version.major}.${c.version.minor}.${c.version.build}.${c.version.patch}`);
                    if (outdated) {
                        let rmfolder = path.join(puppeteer_cache, chtype, c.name);
                        messages.push(`    Outdated folder to be removed: ${rmfolder}`);
                        fs.rmSync(rmfolder, { recursive: true }, err => {
                            if (err) {
                                messages.push(`    Error while removing ${rmfolder}: ${JSON.stringify(err)}`);
                            }
                        });
                    }
                });
                if (outdated_versions) {
                    messages.push(`  Outdated versions marked with ${asterisk} were removed from ${puppeteer_cache}${chtype}`);
                }
            }
        }

        const stats = fs.statfsSync('/', true);
        let freedisk = 100.0 * stats.bavail / stats.blocks;
        messages.push(`\nFree disk availability: ${freedisk.toFixed(2)}%`);

        client.setDisplayName(BOTCONFIG.NAME);
        BOTINFO.STATE = BOT_SLEEP;
    }
    first_ready_received = true;
    await cmd_to_host(BOTCONFIG.TECHLEAD, messages.join("\n"), [], 'ready', false);
}

client.on(Events.READY, async () => {
    try {
        let cstate = await client.getState();
        dtcon.log(`Received READY event: state is ${cstate}`);
    } catch (e) {
        dtcon.error(`READY: Failed to get state for client:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
    }
    if (!clientReadyTimeout) {
        dtcon.log("SCHEDULE handling READY event");
        clientReadyTimeout = setTimeout(client_ready, 1500);
    }
});

client.on(Events.CONTACT_CHANGED, async (msg, oldId, newId, isContact) => {
    // Only return for events which is a contact
    dtcon.log(`%%%%% CONTACT_CHANGED:\nmsg: ${JSON.stringify(msg, null, 2)}\noldId: ${oldId}, newId: ${newId}\nisContact: ${isContact}`);
    let name = null;
    if (oldId.endsWith('@lid')) {
        oldId = await convertXidtoPn(oldId);
        let contact = await client.getContactById(oldId);
        if (contact?.name) {
            name = contact.name;
        }
    }
    if (newId.endsWith('@lid')) {
        newId = await convertXidtoPn(newId);
        if (!name) {
            let contact = await client.getContactById(newId);
            if (contact?.name) {
                name = contact.name;
            } else if (contact?.pushname) {
                name = contact.pushname;
            }
        }
    }
    await cmd_to_host(msg.from, {
        msg: msg,
        isgroup: !isContact,
        oldId: oldId,
        newId: newId,
        name: name ?? "Unknown name"
    }, [], Events.CONTACT_CHANGED);
});

client.on(Events.MESSAGE_RECEIVED, async msg => {
    dtcon.log('Event: MESSAGE RECEIVED', msg);

    try {
        // Ignore status messages
        if (msg.isStatus || msg.from == "status@broadcast") {
            dtcon.log("Ignore status message");
            return;
        }
        if (msg.type != MessageTypes.TEXT) {
            dtcon.log(`Ignore message type: ${msg.type}`);
            return;
        }
        let senderContact = await msg.getContact();
        let commonGroups = await senderContact.getCommonGroups();
        let chat = await msg.getChat();

        if (msg.body.match(/^[!\/]/)) {
            if (BOTINFO.STATE == BOT_ACTIVE) {
                if (!chat.isGroup) {
                    let reply = await cmd_to_host(msg.from, msg.body, commonGroups);
                    if (reply) {
                        msg.reply(reply, null, { ignoreQuoteErrors: true, linkPreview: false });
                    }
                } else {
                    let author = await convertXidtoPn(msg.author);
                    dtcon.log(`group_message author: ${author}`);
                    let reply = await cmd_to_host(author, msg.body, commonGroups, "group_message", true, { group: msg.from });
                    if (reply) {
                        msg.reply(reply, null, { ignoreQuoteErrors: true, linkPreview: false });
                    }
                }
            } else if (!chat.isGroup && msg.body.trim() == `!wake ${BOTINFO.HOSTNAME}`) {
                dtcon.log("RECEIVED COMMAND TO WAKE SELF....");
                BOTINFO.STATE = BOT_ACTIVE;
            }
        } else if (BOTINFO.STATE == BOT_ACTIVE && !chat.isGroup) {
            let reply = await cmd_to_host(msg.from, msg.body, commonGroups);
            if (reply) {
                msg.reply(reply, null, { ignoreQuoteErrors: true });
            }
        }
    } catch (e) {
        dtcon.error(`Error in handling message:\n${e?.name}: ${e?.message}\nJSON.stringify(e?.cause, null, 2)`);
    }
});

client.on(Events.MESSAGE_CREATE, (msg) => {
    // Fired on all message creations, including your own
    if (msg.fromMe && msg.type == "chat") {
        // For logging - this can get verbose.
        // dtcon.log("==== message_create chat event ====");
        // dtcon.log(msg.body);
        // dtcon.log("==== end message_create chat event ====");
    }
});

client.on(Events.MESSAGE_REVOKED_EVERYONE, async (after, before) => {
    // Fired whenever a message is deleted by anyone (including you)
    dtcon.log("Event: message_revoked_everyone", after); // message after it was deleted.
    if (before) {
        dtcon.log(before); // message before it was deleted.
    }
});

client.on(Events.MESSAGE_REVOKED_ME, async (msg) => {
    // Fired whenever a message is only deleted in your own view.
    dtcon.log("Event: message_revoke_me", msg.body); // message before it was deleted.
});

client.on(Events.MESSAGE_ACK, (msg, ack) => {
    /*
        == ACK VALUES ==
        ACK_ERROR: -1
        ACK_PENDING: 0
        ACK_SERVER: 1
        ACK_DEVICE: 2
        ACK_READ: 3
        ACK_PLAYED: 4
    */

    if (ack == 3) {
        // The message was read
    }
});

client.on(Events.MESSAGE_REACTION, async (reaction) => {
    dtcon.log('Event: message_reaction', JSON.stringify(reaction));
    let senderId = await convertXidtoPn(reaction.senderId);
    let number = senderId.replace(/@[cg]\.us$/, '');
    await cmd_to_host(number, reaction, [], "message_reaction");
});


client.on(Events.GROUP_JOIN, async (notification) => {
    // User has joined or been added to the group.
    dtcon.log('Event: group_join', notification);
    if (BOTINFO.STATE != BOT_ACTIVE) {
        // BOT is not processing commands - get out
        return;
    }
    let chat = await client.getChatById(notification.chatId);
    let participantID = await convertXidtoPn(notification.id.participant);
    let participant_name = "Unknown";
    try {
        let contact = await client.getContactById(participantID);
        participant_name = contact.name;
    }
    catch (e) {
        participant_name = `Unknown with error:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause)}`;
    }
    let grpjoininfo = {
        group_id: notification.chatId,
        group_name: chat.name,
        participant_name: participant_name,
        number: participantID.replace(/@c\.us$/, '')
    };
    await cmd_to_host(participantID, grpjoininfo, [], "group_join");
});

client.on(Events.GROUP_LEAVE, async (notification) => {
    // User has left or been kicked from the group.
    dtcon.log('Event: group_leave', notification);
    if (BOTINFO.STATE != BOT_ACTIVE) {
        // BOT is not processing commands - get out
        return;
    }
    let chat = await client.getChatById(notification.chatId);
    let participantID = await convertXidtoPn(notification.id.participant);
    let participant_name = "Unknown";
    try {
        let contact = await client.getContactById(participantID);
        participant_name = contact.name;
    }
    catch (e) {
        participant_name = `Unknown with error:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause)}`;
    }
    let grpleaveinfo = {
        group_id: notification.chatId,
        group_name: chat.name,
        participant_name: participant_name,
        number: participantID.replace(/@c\.us$/, '')
    };
    await cmd_to_host(participantID, grpleaveinfo, [], "group_leave");
});

client.on(Events.GROUP_UPDATE, async (notification) => {
    // Group information has been updated
    dtcon.log('Event: group_update', notification);
    if (BOTINFO.STATE != BOT_ACTIVE) {
        // BOT is not processing commands - get out
        return;
    }
    let chat = await client.getChatById(notification.chatId);
    let participantID = await convertXidtoPn(notification.id.participant);
    let grpupdateinfo = {
        group_id: notification.chatId,
        group_name: chat.name,
    };
    await cmd_to_host(participantID, grpupdateinfo, [], "group_update");
});

client.on(Events.STATE_CHANGED, async (state) => {
    let data = {
        state: state,
        timestamp: new Date().getTime()
    };
    dtcon.log('Event: CHANGE STATE', state);
    await cmd_to_host(BOTCONFIG.TECHLEAD, data, [], 'change_state', false);
});

var clientStartTimeoutObject = null;
// start client in 4 seconds
setTimeout(startClient, 4000);

// Workaround bug in handling client.destroy()
// - see https://github.com/pedroslopez/whatsapp-web.js/pull/3847
async function destroyClient() {
    const browser = client.pupBrowser;
    const isConnected = browser?.isConnected?.();
    if (isConnected) {
        await browser.close();
    } else {
        dtcon.error("!!!!!! Browser is not connected");
    }
    await client.authStrategy.destroy();
    // Make info null to force client.initalize() to be called to
    // re-use client
    client.info = null;
}

async function startClient() {
    dtcon.log("startClient: Initiating client start");
    if (CLIENT_STATE == CLIENT_OFF) {
        dtcon.log("startClient: really initializing because client has no state");
        CLIENT_STATE = CLIENT_STARTING;
        await EnterCriticalSection(1);
        if (clientStartTimeoutObject) {
            // Is connected - kill timer to initialize client
            clearTimeout(clientStartTimeoutObject);
            clientStartTimeoutObject = null;
        }
        await LeaveCriticalSection(1);
        await client.initialize();
        CLIENT_STATE = CLIENT_READY;
        dtcon.log("startClient: completed initializing");
    }
    await EnterCriticalSection(1);
    clientStartTimeoutObject = null;
    if (!monitorClientTimer) {
        monitorClientTimer = setInterval(monitorClient, 30000);
    }
    await LeaveCriticalSection(1);
}

// =========================================================================
// Client monitoring code to start the client if it has not been
// started
async function monitorClient() {
    let state = null;
    try {
        state = await client.getState();
        dtcon.log(`monitorClient:  state is ${state}`);
    } catch (e) {
        state = null;
        dtcon.error(`\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`);
    }
    if (state == null) {
        await EnterCriticalSection(1);
        if (!clientStartTimeoutObject) {
            const clientStartTime = 30; // Client start time
            dtcon.log(`monitorClient: Client not connected - start timer to start client in ${clientStartTime} seconds`);
            clientStartTimeoutObject = setTimeout(startClient, clientStartTime * 1000);
        }
        await LeaveCriticalSection(1);
    } else {
        await EnterCriticalSection(1);
        if (clientStartTimeoutObject) {
            // Is connected - kill timer to initialize client
            dtcon.log("monitorClient: Client present - clearing timer to start client");
            clearTimeout(clientStartTimeoutObject);
            clientStartTimeoutObject = null;
        }
        await LeaveCriticalSection(1);
        if (state !== WAState.CONNECTED) {
            // Return if client not yet fully authenticated
            return;
        }

        await client.sendPresenceAvailable();   // Mark client as present
        let version = await client.getWWebVersion();
        if (version != BOTINFO.VERSION) {
            let chatInfo = await client.getNumberId(BOTCONFIG.TECHLEAD);
            let chatId = chatInfo._serialized;
            await client.sendMessage(chatId, `!! New WhatsApp Web version ${version} detected in host ${BOTINFO.HOSTNAME}.\nOld version was ${BOTINFO.VERSION}`);
            BOTINFO.VERSION = version;
        }
    }
}

// HMAC
function generateAuthHeaders(payload) {
    const timestamp = parseInt(Math.floor(Date.now() / 1000));
    // TODO const nonce = crypto.randomBytes(16).toString('hex'); // Generate a unique 32-char hex string
    const nonce = crypto.randomUUID();

    // Must match the server's signed string format: payload|timestamp|nonce
    const signedString = `${payload}|${timestamp}|${nonce}`;

    const hmac = crypto.createHmac('sha256', BOTCONFIG.BOT_SECRET);
    hmac.update(signedString);
    const signature = hmac.digest('hex');

    return {
        'x-timestamp': timestamp,
        'x-nonce': nonce,
        'x-signature': signature,
    };
}

// -- Helper functions for HMAC signature
/**
 * Validates the HMAC signature sent by the host.
 */
function createSignedString(payload, timestamp, nonce) {
    return `${payload}|${timestamp}|${nonce}`;
}

function isValidSignature(payload, timestamp, nonce, clientSignature) {
    const signedString = createSignedString(payload, timestamp, nonce);
    const hmac = crypto.createHmac('sha256', BOTCONFIG.BOT_SECRET);
    hmac.update(signedString);
    const expectedSignature = hmac.digest('hex');

    return expectedSignature === clientSignature;
}

function isTimestampValid(timestamp) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return Math.abs(nowInSeconds - parseInt(timestamp)) <= VALIDITY_WINDOW_SECONDS;
}

// Manage nonces
function isNonceUnique(nonce, timestamp) {
    if (nonceCache.has(nonce)) {
        return false;
    }
    nonceCache.set(nonce, parseInt(timestamp), VALIDITY_WINDOW_SECONDS);
    return true;
}

var monitorClientTimer = null;
var monitorServerTimer = setInterval(monitorServer, 60000);

async function session_expired(key, value) {
    dtcon.log(`@@@@@ Session expired for ${key}, started at ${gentsdate(value)}`);
    dtcon.log(`@@@@@ Leaving Critical Section 0`);
    await LeaveCriticalSection(0);
}

async function session_deleted(key, value) {
    dtcon.log(`@@@@@ Session deleted for ${key}, started at ${gentsdate(value)}`);
    dtcon.log(`@@@@@ Leaving Critical Section 0`);
    await LeaveCriticalSection(0);
}

async function nonce_set(key, value) {
    dtcon.log(`@@@@@ Nonce saved for ${key}, timestamp ${gentsdate(value * 1000)}`);
}

async function nonce_expired(key, value) {
    dtcon.log(`@@@@@ Nonce expired for ${key}, timestamp ${gentsdate(value * 1000)}`);
}

// =========================================================================
// Create the HTTP server
const certPath = process.env.HOME + "/.config/botcert/fullchain.pem";
const keyPath = process.env.HOME + "/.config/botcert/privkey.pem";
const serverOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};
const x509cert = new crypto.X509Certificate(serverOptions.cert);
BOTINFO.SSLEXPIRE = x509cert.validToDate;


const server = https.createServer(serverOptions, async (req, res) => {
    var resTimeout = server.timeout;
    var connectStartTime = Date.now();
    var changeTimeout = connectStartTime + resTimeout - 10000;
    let clientIp = req.socket.remoteAddress;
    let clientPort = req.socket.remotePort;
    let suffix = "";
    dtcon.log(`#### Server Connection start time: ${gentsdate(connectStartTime)}`);

    await monitorServer();
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        suffix = `forwarded by IP address ${clientIp}`;
        clientIp = forwardedFor.split(',')[0].trim();
        clientPort = req.headers?.['x-forwarded-port'] ?? "No forwarded port determined";
    }
    const Xsession = req.headers?.['x-session'];
    const Xtimestamp = req.headers?.['x-timestamp'];
    const Xnonce = req.headers?.['x-nonce'];
    const Xsignature = req.headers?.['x-signature'];

    dtcon.log(`Client connection from ${clientIp} : ${clientPort} -- ${suffix}`);
    dtcon.log(`--- Current server socket timeout: ${resTimeout}`);

    const clientIsLoggedIn = await clientLoggedIn();

    if (req.method == 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
    }
    else if (req.method == 'POST') {
        let body = "";
        var headers = req.headers;
        var response = "OK";
        var url = req.url;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');

        dtcon.log(`Server handling for ${req.socket?.encrypted ? "encrypted" : "unencrypted"} socket`);

        req.on("data", function(chunk) {
            body += chunk;
            if (Date.now() > changeTimeout) {
                resTimeout = resTimeout + 10000;
                res.setTimeout(resTimeout);
                changeTimeout = changeTimeout + 10000;
                dtcon.log(`HTTP Server data: Set new socket timeout: ${resTimeout}`);
            }
        });

        req.on("end", async function() {
            var sessionStart = undefined;

            try {
                // Non-JSON payloads are ignored
                if (headers['content-type'] != 'application/json') {
                    let errmsg = "Non-json content-type" + headers['content-type'];
                    throw new Error(errmsg);
                }

                if (!Xsession) {
                    throw new Error("Missing session ID in packet");
                }
                if (!Xnonce) {
                    throw new Error("Missing nonce in packet");
                }
                if (!Xtimestamp) {
                    throw new Error("Missing timestamp in packet");
                }
                if (!Xsignature) {
                    throw new Error("Missing signature in packet");
                }

                if (sessionCache.has(Xsession)) {
                    throw new Error(`Session ${Xsession} already exist from earlier connection`);
                }

                await EnterCriticalSection(0);
                sessionStart = Date.now();
                sessionCache.set(Xsession, sessionStart, SESSION_TIMEOUT_SECONDS);

                if (!isTimestampValid(Xtimestamp)) {
                    let errmsg = `Timestamp of packet is too old or invalid: ${gentsdate(parseInt(Xtimestamp) * 1000)}`;
                    dtcon.error(errmsg);
                    throw new Error(errmsg);
                }
                if (!isNonceUnique(Xnonce, Xtimestamp)) {
                    let errmsg = `Nonce ${Xnonce} has been re-used`;
                    dtcon.error(errmsg);
                    throw new Error(errmsg);
                }
                if (!isValidSignature(body, Xtimestamp, Xnonce, Xsignature)) {
                    let errmsg = `Invalid signature`;
                    dtcon.error(errmsg);
                    throw new Error(errmsg);
                }
                dtcon.log(`@@@@ Valid signature for packet at ${gentsdate(parseInt(Xtimestamp) * 1000)} with nonce ${Xnonce}`);

                // Handle the proper JSON payloads
                if (url == "/SENDMESSAGE") {
                    dtcon.log(`--- Handling ${url}`);
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /SENDMESSAGE, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    let number;
                    let chatId;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                        let chatInfo = await client.getNumberId(number);
                        chatId = chatInfo._serialized;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDMESSAGE`;
                                res.setHeader('Content-Type', 'text/plain');
                                dtcon.error(response);
                                return;
                            }
                        }
                        chatId = number;
                    }
                    else {
                        response = "ERROR - Illegitimate SENDMESSAGE contents - no Phone nor Group field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let loggedIn = await clientLoggedIn();
                    while (!loggedIn && count > 0) {
                        await sleep(1000);
                        count--;
                        if (Date.now() > changeTimeout) {
                            resTimeout = resTimeout + 10000;
                            res.setTimeout(resTimeout);
                            changeTimeout = changeTimeout + 10000;
                            dtcon.log(`SENDMESSAGE: Set new socket timeout: ${resTimeout}`);
                        }
                        loggedIn = await clientLoggedIn();
                    }
                    if (count < 30) {
                        dtcon.log("Final loggedIn state: " + loggedIn);
                    }
                    if (loggedIn) {
                        await sleep(1000);  // Sleep additional 1 second before sending

                        let msgoption = {
                            mentions: [],
                            ...obj.MsgOption
                        };

                        // Detect the mentions in the chat
                        //  mentions are only active in group chats
                        let chat = await client.getChatById(chatId);
                        if (chat && chat.isGroup) {
                            let _xids = await client.getContactLidAndPhone(chat.participants.map((p) => p.id._serialized));
                            dtcon.log(`Received _xids: ${JSON.stringify(_xids, null, 2)}`);
                            msgoption.mentions = _xids.map(p => p.pn);
                        }

                        let msgstatus = await client.sendMessage(chatId, obj.Message, msgoption);
                        dtcon.log(JSON.stringify(msgstatus));

                        response = "OK";
                        res.setHeader('Content-Type', 'text/plain');
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                } else if (url == "/SENDMEDIA") {
                    dtcon.log(`--- Handling ${url}`);
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /SENDMEDIA, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    let number;
                    let chatId;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                        let chatInfo = await client.getNumberId(number);
                        chatId = chatInfo._serialized;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDMESSAGE`;
                                res.setHeader('Content-Type', 'text/plain');
                                dtcon.error(response);
                                return;
                            }
                        }
                        chatId = number;
                    }
                    else {
                        response = "ERROR - Illegitimate SENDMEDIA contents - no Phone nor Group field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let loggedIn = await clientLoggedIn();
                    while (!loggedIn && count > 0) {
                        await sleep(1000);
                        count--;
                        if (Date.now() > changeTimeout) {
                            resTimeout = resTimeout + 10000;
                            res.setTimeout(resTimeout);
                            changeTimeout = changeTimeout + 10000;
                            dtcon.log(`SENDMEDIA: Set new socket timeout: ${resTimeout}`);
                        }
                        loggedIn = await clientLoggedIn();
                    }
                    if (count < 30) {
                        dtcon.log("Final loggedIn state: " + loggedIn);
                    }
                    if (loggedIn) {
                        await sleep(1000);  // Sleep additional 1 second before sending

                        let msgoption = {
                            mentions: [],
                            ...obj.MsgOption
                        };

                        // Detect the mentions in the chat
                        //  mentions are only active in group chats
                        let chat = await client.getChatById(chatId);
                        if (chat && chat.isGroup) {
                            let _xids = await client.getContactLidAndPhone(chat.participants.map((p) => p.id._serialized));
                            dtcon.log(`Received _xids: ${JSON.stringify(_xids, null, 2)}`);
                            msgoption.mentions = _xids.map(p => p.pn);
                        }

                        const media = new MessageMedia(obj.Media.mimetype, obj.Media.data);
                        if (obj.Media?.caption) {
                            msgoption.caption = obj.Media.caption;
                        }
                        let msgstatus = await client.sendMessage(chatId, media, msgoption);
                        response = JSON.stringify(msgstatus);
                        dtcon.log(response);
                        res.setHeader('Content-Type', 'text/plain');
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                } else if (url == "/SENDCONTACT") {
                    dtcon.log(`--- Handling ${url}`);
                    // Send a poll
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /SENDCONTACT, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    let number;
                    let chatId;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                        let chatInfo = await client.getNumberId(number);
                        chatId = chatInfo._serialized;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDCONTACT`;
                                res.setHeader('Content-Type', 'text/plain');
                                dtcon.error(response);
                                return;
                            }
                        }
                        chatId = number;
                    }
                    else {
                        response = "ERROR - Illegitimate SENDCONTACT contents - no Phone nor Group field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let loggedIn = await clientLoggedIn();
                    while (!loggedIn && count > 0) {
                        await sleep(1000);
                        count--;
                        if (Date.now() > changeTimeout) {
                            resTimeout = resTimeout + 10000;
                            res.setTimeout(resTimeout);
                            changeTimeout = changeTimeout + 10000;
                            dtcon.log(`SENDCONTACT: Set new socket timeout: ${resTimeout}`);
                        }
                        loggedIn = await clientLoggedIn();
                    }
                    if (count < 30) {
                        dtcon.log("Final loggedIn state: " + loggedIn);
                    }
                    if (loggedIn) {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        let contact = await client.getContactById(obj.ContactId);
                        let msgstatus = await client.sendMessage(chatId, contact);

                        response = "OK";
                        res.setHeader('Content-Type', 'text/plain');
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                } else if (url == "/SENDPOLL") {
                    dtcon.log(`--- Handling ${url}`);
                    // Send a poll
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /SENDPOLL, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    dtcon.log("Sending poll to " + obj.Name + ": " + obj.Poll.pollName + " ; poll options: " + obj.Poll.pollOptions.map((p) => p.name).join("##"));
                    dtcon.log(JSON.stringify(obj.Poll));
                    let number;
                    let chatId;
                    if ('Phone' in obj) {
                        number = obj.Phone.replace('+', '');
                        number = number.includes('@c.us') ? number : `${number}@c.us`;
                        let chatInfo = await client.getNumberId(number);
                        chatId = chatInfo._serialized;
                    }
                    else if ('Group' in obj) {
                        // Sending to group if object does not have Phone property
                        number = obj.Group;

                        // Determine if number is invite code or group code
                        // - need to convert to group code if required
                        let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                        if (mx) {
                            // Is a number - append @g.us if required
                            number = mx[2] ? number : `${number}@g.us`;
                        }
                        else {
                            // Invite code - need to convert to group code
                            try {
                                let grp = await client.getInviteInfo(number);
                                number = grp.id._serialized;
                            } catch (e) {
                                // Invalid invite code
                                response = `ERROR - Illegitimate invite code ${obj.Group} given in SENDPOLL`;
                                res.setHeader('Content-Type', 'text/plain');
                                dtcon.error(response);
                                return;
                            }
                        }
                        chatId = number;
                    }
                    else {
                        response = "ERROR - Illegitimate SENDPOLL contents - no Phone nor Group field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let loggedIn = await clientLoggedIn();
                    while (!loggedIn && count > 0) {
                        await sleep(1000);
                        count--;
                        if (Date.now() > changeTimeout) {
                            resTimeout = resTimeout + 10000;
                            res.setTimeout(resTimeout);
                            changeTimeout = changeTimeout + 10000;
                            dtcon.log(`SENDPOLL: Set new socket timeout: ${resTimeout}`);
                        }
                        loggedIn = await clientLoggedIn();
                    }
                    if (count < 30) {
                        dtcon.log("Final loggedIn state: " + loggedIn);
                    }
                    if (loggedIn) {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        let npoll = new Poll(obj.Poll.pollName, obj.Poll.pollOptions, obj.Poll.options);
                        response = JSON.stringify(await client.sendMessage(chatId, npoll));
                        res.setHeader('Content-Type', 'text/plain');
                        await client.interface.openChatWindow(chatId);
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                } else if (url == "/GROUPMEMBERS") {
                    dtcon.log(`--- Handling ${url}`);
                    // Query for group members
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /GROUPMEMBERS, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    dtcon.log("Getting group members of " + obj.Name);
                    if (!'Group' in obj) {
                        response = "ERROR - Illegitimate GROUPMEMBERS contents - no Group field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    // Sending to group if object does not have Phone property
                    let number = obj.Group;
                    dtcon.log("Received raw group number: " + number);

                    // Determine if number is invite code or group code
                    // - need to convert to group code if required
                    let mx = number.match(/^([^A-Za-z\s]+?)(@g\.us)?$/);
                    if (mx) {
                        // Is a number - append @g.us if required
                        number = mx[2] ? number : `${number}@g.us`;
                    }
                    else {
                        // Invite code - need to convert to group code
                        try {
                            let grp = await client.getInviteInfo(number);
                            number = grp.id._serialized;
                        } catch (e) {
                            // Invalid invite code
                            response = `ERROR - Illegitimate invite code ${obj.Group} given in GROUPMEMBERS`;
                            res.setHeader('Content-Type', 'text/plain');
                            dtcon.error(response);
                            return;
                        }
                    }
                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let loggedIn = await clientLoggedIn();
                    while (!loggedIn && count > 0) {
                        await sleep(1000);
                        count--;
                        if (Date.now() > changeTimeout) {
                            resTimeout = resTimeout + 10000;
                            res.setTimeout(resTimeout);
                            changeTimeout = changeTimeout + 10000;
                            dtcon.log(`GROUPMEMBERS: Set new socket timeout: ${resTimeout}`);
                        }
                        loggedIn = await clientLoggedIn();
                    }
                    if (count < 30) {
                        dtcon.log("Final loggedIn state: " + loggedIn);
                    }
                    if (loggedIn) {
                        await sleep(1000);  // Sleep additional 1 second before sending

                        // get the chat
                        let chat = await client.getChatById(number);
                        if (chat && chat.isGroup) {
                            dtcon.log("found chat: ", JSON.stringify(chat.id));
                            let _xids = await client.getContactLidAndPhone(chat.participants.map((p) => p.id._serialized));
                            dtcon.log(`Received _xids: ${JSON.stringify(_xids, null, 2)}`);
                            let grpmembers = _xids.map(p => p.pn);
                            dtcon.log("found " + grpmembers.length + " members");
                            dtcon.log(JSON.stringify(grpmembers, null, 2));
                            response = JSON.stringify(grpmembers);
                            res.setHeader('Content-Type', 'text/plain');
                        }
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                } else if (url == "/COMMAND") {
                    dtcon.log(`--- Handling ${url}`);
                    // Query to send a command
                    var jsonmsg = body;
                    var obj = JSON.parse(jsonmsg);
                    if (!clientIsLoggedIn) {
                        dtcon.error(`Client is not logged in - /SENDCOMMAND, jsonmsg = ${JSON.stringify(obj, null, 2)}`);
                        throw new Error("Client is not logged in");
                    }
                    if (!'Command' in obj) {
                        response = "ERROR - Illegitimate COMMAND contents - no Command field";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                        return;
                    }
                    dtcon.log("Getting command " + obj.Command);
                    let valid_commands = ["reboot", "webappstate", "activate", "sleep", "botoff", "logout", "ping", "groupinfo", "getlog", "rmlog", "npmoutdated", "findMessage", "pinMessage", "unpinMessage", "fetchMessages", "deleteMessage", "getPollVotes", "vote", "getContacts", "addContact", "getLidContact", "refresh"];

                    // Skip if no valid commands
                    if (!valid_commands.includes(obj.Command)) {
                        return;
                    }

                    // Wait up to 30 seconds for client to get connected
                    let count = 30;
                    let state = await client.getState();

                    // If ping command, respond with pong and WA client state
                    if (obj.Command == "ping") {

                        let cpus = os.cpus();

                        let total = cpus.reduce((psum, cpu) =>
                            psum + Object.values(cpu.times).reduce((pcsum, t) => pcsum + t, 0), 0);
                        let totalidle = cpus.reduce((psum, cpu) =>
                            psum + cpu.times.idle, 0);

                        // path in mounted volume
                        const pathToCheck = '/';

                        const stats = fs.statfsSync(pathToCheck, true);
                        let freedisk = 100.0 * stats.bavail / stats.blocks;
                        let cpuusage = 100 * (1.0 - totalidle / total);
                        let memusage = 100 * (1.0 - os.freemem() / os.totalmem());
                        let pongobj = {
                            STATE: BOTINFO.STATE,
                            clientstate: state,
                            cpuusage: cpuusage.toFixed(2) + "%",
                            memusage: memusage.toFixed(2) + "%",
                            freedisk: freedisk.toFixed(2) + "%"
                        };
                        response = "pong:" + JSON.stringify(pongobj);
                        res.setHeader('Content-Type', 'text/plain');
                        return;
                    }
                    else if (obj.Command === "getlog") {
                        let logfilename = path.join(path.dirname(__filename), 'wabot.log');
                        response = `${BOTINFO.HOSTNAME} logs:\n` + fs.readFileSync(logfilename, 'utf8');
                        res.setHeader('Content-Type', 'text/plain');
                        return;
                    }
                    else if (obj.Command === "rmlog") {
                        let logfilename = path.join(path.dirname(__filename), 'wabot.log');
                        fs.truncateSync(logfilename);
                        dtcon.log('wabot.log file truncated');
                        return;
                    }
                    else if (obj.Command === "groupinfo") {
                        dtcon.log(`GROUPINFO: Current socket timeout: ${resTimeout}`);

                        // Retrieve the group names and IDs that this client belongs to
                        let chats = await client.getChats();
                        const contacts = await client.getContacts();
                        let groups = {};
                        chats = chats.filter(c => c.isGroup && !c.groupMetadata.isParentGroup && !c.groupMetadata.announce);
                        res.setHeader('Content-Type', 'application/json');
                        for (const chat of chats) {
                            dtcon.log(`GROUPINFO: Collecting info for group chat ${chat.name}`);
                            let grpinfo = {};
                            let desc = chat?.groupMetadata?.desc ?? "None";
                            let creator = "unknown";
                            let creatorphone = (await convertXidtoPn(chat.groupMetadata.owner._serialized)).replace(/@[cg]\.us$/, '');
                            let contact = contacts.find(c => c.number == creatorphone);
                            if (contact) {
                                creator = contact.name;
                            }

                            let invitecode = "";

                            let pid = null;
                            let _xids = await client.getContactLidAndPhone(chat.groupMetadata.participants.map((p) => p.id._serialized));
                            let participants = _xids.map(p => p.pn);
                            for (const p of participants) {
                                let ct = await client.getContactById(p);
                                if (ct.isMe) {
                                    pid = p;
                                    break;
                                }
                            }
                            if (pid?.isAdmin) {
                                try {
                                    invitecode = await chat.getInviteCode();
                                } catch (e) {
                                    // Invalid invite code
                                    let errmsg = `ERROR in getInviteCode -\n${e?.name}: ${e?.message}\n ${JSON.stringify(e?.cause)}`;
                                    dtcon.error(errmsg);
                                    invitecode = "";
                                }
                            }
                            grpinfo.ID = chat.id._serialized;
                            grpinfo.Description = desc;
                            grpinfo.CreateInfo = `${creator} - ${creatorphone}`;
                            grpinfo.InviteCode = invitecode;
                            groups[chat.name] = grpinfo;
                            sessionCache.ttl(Xsession, SESSION_TIMEOUT_SECONDS);
                            if (Date.now() > changeTimeout) {
                                resTimeout = resTimeout + 10000;
                                res.setTimeout(resTimeout);
                                changeTimeout = changeTimeout + 10000;
                                dtcon.log(`GROUPINFO: Set new socket timeout: ${resTimeout}`);
                            }
                        }
                        dtcon.log("GROUPINFO: Completed command");
                        response = JSON.stringify(groups);
                        return;
                    }
                    else if (obj.Command === "npmoutdated") {
                        response = JSON.stringify(requireUncached('./outdated.json'));
                        res.setHeader('Content-Type', 'application/json');
                        return;
                    }
                    else if (obj.Command == "findMessage") {
                        // need Parameters = {
                        //   msgId: <string> serialized id
                        // }
                        // serialized ID is of form:
                        // true_<chat id including @*.us suffix>_<msgid>_<sender id including @c.us suffix>
                        // example:
                        // true_120363024196939487@g.us_3EB00A3544B32D4AAE2C53_6588145614@c.us
                        let foundmsg = await client.getMessageById(obj.Parameters.msgId);
                        if (foundmsg) {
                            response = JSON.stringify(foundmsg);
                            await client.interface.openChatWindowAt(foundmsg.id._serialized);
                            res.setHeader('Content-Type', 'text/plain');
                        } else {
                            response = "{}";
                            res.setHeader('Content-Type', 'application/json');
                        }
                        return;
                    }
                    else if (obj.Command == "pinMessage") {
                        // need Parameters = {
                        //   msgId: <string> serialized id
                        //   duration: <number> Duration in seconds that message will be pinned in chat
                        // }
                        // serialized ID is of form:
                        // true_<chat id including @*.us suffix>_<msgid>_<sender id including @c.us suffix>
                        // example:
                        // true_120363024196939487@g.us_3EB00A3544B32D4AAE2C53_6588145614@c.us
                        let foundmsg = await client.getMessageById(obj.Parameters.msgId);
                        if (foundmsg) {
                            response = JSON.stringify(foundmsg);
                            await client.interface.openChatWindowAt(foundmsg.id._serialized);
                            let pinStatus = await foundmsg.pin(obj.Parameters.duration);
                            response = pinStatus ? "OK" : "ERROR: Failed to pin message";
                        } else {
                            response = "ERROR: Cannot find message";
                        }
                        res.setHeader('Content-Type', 'text/plain');
                        return;
                    }
                    else if (obj.Command == "unpinMessage") {
                        // need Parameters = {
                        //   msgId: <string> serialized id
                        // }
                        // serialized ID is of form:
                        // true_<chat id including @*.us suffix>_<msgid>_<sender id including @c.us suffix>
                        // example:
                        // true_120363024196939487@g.us_3EB00A3544B32D4AAE2C53_6588145614@c.us
                        let foundmsg = await client.getMessageById(obj.Parameters.msgId);
                        if (foundmsg) {
                            response = JSON.stringify(foundmsg);
                            await client.interface.openChatWindowAt(foundmsg.id._serialized);
                            let unpinStatus = await foundmsg.unpin();
                            response = unpinStatus ? "OK" : "ERROR: Failed to unpin message";
                        } else {
                            response = "ERROR: Cannot find message";
                        }
                        res.setHeader('Content-Type', 'text/plain');
                        return;
                    }
                    else if (obj.Command == "fetchMessages") {
                        // need Parameters = {
                        //   name: <string>     Mandatory  Name of chat
                        //   limit: <Number>    Optional   Number of messages to retrieve 
                        // }
                        let chats = await client.getChats();
                        let chat = chats.find(c => c.name === obj.Parameters.name);
                        response = "[]";
                        if (chat) {
                            dtcon.log(`fetchMessages: found chat ${chat.name} with id ${chat.id._serialized}`);
                            dtcon.log(JSON.stringify(chat, null, 2));
                            await client.interface.openChatWindow(chat.id._serialized);
                            let chatsynced = await chat.syncHistory();
                            dtcon.log(`fetchMessages: chat sync status: ${chatsynced}`);
                            await client.interface.openChatWindow(chat.id._serialized);

                            let searchOptions = {};
                            if (obj.Parameters.limit) {
                                searchOptions.limit = obj.Parameters.limit;
                            }
                            let messages = await chat.fetchMessages(searchOptions);
                            response = JSON.stringify(messages);
                            res.setHeader('Content-Type', 'text/plain');
                        }
                        else {
                            dtcon.log(`Could not find chat ${obj.Parameters.name}`);
                            dtcon.log(`Total chats: ${chats.length}`);
                            dtcon.log(`${chats.map(c => c.name).join("\n")}`);
                            res.setHeader('Content-Type', 'application/json');
                        }
                        return;
                    }
                    else if (obj.Command == "deleteMessage") {
                        // need Parameters = {
                        //   msgId: <string>      Mandatory   serialized id of message
                        //   everyone: <boolean>  Optional    default true - will delete for everyone
                        // }
                        let foundmsg = await client.getMessageById(obj.Parameters.msgId);
                        response = "";
                        if (foundmsg) {
                            let deleteEveryone = obj.Parameters?.everyone ?? true;
                            try {
                                await foundmsg.delete(deleteEveryone);
                                response = "OK";
                            } catch (e) {
                                response = `${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause)}`;
                            }
                        }
                        res.setHeader('Content-Type', 'text/plain');
                        return;
                    }
                    else if (obj.Command == "getContacts") {
                        // Get only contacts in phone book
                        let contacts = await client.getContacts();
                        if (contacts?.length) {
                            let xct = contacts.filter(c => c.id.server == "c.us" && c.isMyContact);
                            response = JSON.stringify(xct);
                            res.setHeader('Content-Type', 'text/plain');
                        } else {
                            response = "[]";
                            res.setHeader('Content-Type', 'application/json');
                        }
                        return;
                    }
                    else if (obj.Command === "addContact") {
                        let resChatId = await client.saveOrEditAddressbookContact(
                            obj.Parameters.phoneNumber, obj.Parameters.firstName,
                            obj.Parameters.lastName, true);
                        return;
                    }
                    else if (obj.Command === "getLidContact") {
                        response = await convertXidtoPn(obj.Parameters.lid);
                        return;
                    }
                    else if (obj.Command === "refresh") {
                        dtcon.log("REFRESH command");
                        await client.pupPage.reload();
                        return;
                    }
                    else if (obj.Command == "getPollVotes") {
                        // need Parameters = {
                        //   pollMsgId: <string> serialized id
                        // }
                        // serialized ID is of form:
                        // true_<chat id including @*.us suffix>_<msgid>_<sender id including @c.us suffix>
                        // example:
                        // true_120363024196939487@g.us_3EB00A3544B32D4AAE2C53_6588145614@c.us
                        // Returns array of pollVotes
                        const votes = await client.getPollVotes(obj.Parameters.pollMsgId)
                        if (votes) {
                            // Remove parentMessage object from each vote to reduce the
                            // size of returning string
                            votes.forEach((v, i) => {
                                const { parentMessage, ...newVote } = v;
                                votes[i] = newVote;
                            });
                            response = JSON.stringify(votes);
                            res.setHeader('Content-Type', 'text/plain');
                        } else {
                            response = "[]";
                            res.setHeader('Content-Type', 'application/json');
                        }
                        return;
                    }
                    else if (obj.Command == "vote") {
                        // need Parameters = {
                        //   pollMsgId: <string> serialized id
                        //   selectedOptions: Array<string> selected options
                        // }
                        // serialized ID is of form:
                        // true_<chat id including @*.us suffix>_<msgid>_<sender id including @c.us suffix>
                        // example:
                        // true_120363024196939487@g.us_3EB00A3544B32D4AAE2C53_6588145614@c.us
                        let foundmsg = await client.getMessageById(obj.Parameters.pollMsgId);
                        if (foundmsg) {
                            await foundmsg.vote(obj.Parameters.selectedOptions);
                            response = "OK";
                        } else {
                            response = "ERROR: Could not find poll message";
                        }
                        res.setHeader('Content-Type', 'text/plain');
                    }
                    else if (obj.Command === "logout") {
                        BOTINFO.STATE = BOT_OFF;
                        setTimeout(client_logout, 1000 * 15);    // close server in 15 seconds
                        return;
                    }
                    else if (obj.Command === "reboot") {
                        BOTINFO.STATE = BOT_OFF;
                        setTimeout(reboot, 1000 * 15, true); // reboot in 15 seconds
                        return;
                    }

                    while (state != WAState.CONNECTED && count > 0) {
                        await sleep(1000);
                        dtcon.log("Waiting STATE: " + state);
                        count--;
                        state = await client.getState();
                    }
                    if (count < 30) {
                        dtcon.log("Final STATE: " + state);
                    }
                    if (state == WAState.CONNECTED) {
                        await sleep(1000);  // Sleep additional 1 second before sending
                        if (obj.Command === "webappstate") {
                            WEBAPPSTATE_OK = obj.Parameters.state;
                        }
                        else if (obj.Command === "activate") {
                            BOTINFO.STATE = BOT_ACTIVE;
                        }
                        else if (obj.Command === "sleep") {
                            BOTINFO.STATE = BOT_SLEEP;
                        }
                        else if (obj.Command === "botoff") {
                            BOTINFO.STATE = BOT_OFF;
                        }
                    }
                    else {
                        response = "ERROR - client is not connected";
                        res.setHeader('Content-Type', 'text/plain');
                        dtcon.error(response);
                    }
                }
            }
            catch (e) {
                response = "ERROR CAUGHT: " + `${e?.stack ?? "no stack"}\n${e?.cause ?? "no cause"}`;
                dtcon.error(response);

                res.statusCode = 400;
            }
            finally {
                if (sessionStart) {
                    dtcon.log(`Critical Section entered for session ${Xsession}`);
                    sessionCache.del(Xsession);
                }
                res.end(response);
                let endConnectTime = Date.now();
                dtcon.log(`#### Server Connection end time: ${gentsdate(endConnectTime)}`);
                dtcon.log(`#### Server Connection elapsed time: ${endConnectTime - connectStartTime}`);
            }
        });
    } else {
        dtcon.error(`HTTP Server warning: Unhandled method ${req.method}: ${JSON.stringify(req, null, 2)}`);
    }
});

server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.timeout = 35000;
server.keepAliveTimeout = 15000;

server.listen(BOTCONFIG.SERVER_PORT);

server.on('clientError', (err, socket) => {
    if (err.code === 'ECONNRESET' || !socket.writable) {
        dtcon.error(`Returning from HTTP Server clientError: ${err?.code ?? "NoErrorCode"}`);
        return;
    }
    dtcon.error(`Close HTTP Server due to clientError: ${err?.code ?? "NoErrorCode"}`);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

async function monitorServer() {
    if (!server?.listening) {
        dtcon.error("HTTP Server is not listening");
    }
    server?.getConnections((err, count) => {
        if (err) {
            dtcon.error(`Error getting HTTP Server connections: ${err}`);
        } else {
            dtcon.log(`Number of active HTTP Server connections: ${count}`);
        }
    });
}

// Function that message to Google Script host.
// The function returns a string to reply to the command
// or and empty string to indicate that no reply is required.
// Parameters:
//   number : phone number of sender (including possible trailing @c.us)
//   contents: contents of message
//   groups: array of common groups shared with sender
//   waevent: WhatsApp client event; default is "message"
//   bot_active: if true, BOT state must be active; default is true
async function cmd_to_host(number, contents, groups = [], waevent = "message", bot_active = true, data = {}) {
    var response = "";
    if (number == "status@broadcast") {
        return response;
    }
    if (bot_active && BOTINFO.STATE != BOT_ACTIVE) {
        return response;
    }
    try {
        // Called in a way to make this synchronous
        if (WEBAPPSTATE_OK) {
            let cmd_promise = promise_cmd_to_host(number, contents, groups, waevent, data);
            response = await cmd_promise;
        }
        else {
            response = "Google outage: Bot commands are not available.";
        }
    } catch (e) {
        // Promise rejected
        let errmsg = `ERROR in cmd_to_host:\n${e?.name}: ${e?.message}\n${JSON.stringify(e?.cause, null, 2)}`;
        dtcon.error(errmsg);
    }
    return response;
}

function promise_cmd_to_host(number, contents, groups = [], waevent = "message", data = {}) {
    var promise = new Promise((resolve, reject) => {
        var responseBody = '';

        let objevent = { botinfo: BOTINFO };
        objevent[waevent] = {
            number: number.replace(/@[cg]\.us$/, ''),
            contents: contents,
            groups: groups,
            data: data
        };

        // Do not encrypt - because we are already communicating with host over HTTPS
        const authObj = generateAuthHeaders(JSON.stringify(objevent));
        objevent['auth'] = authObj;
        const postData = JSON.stringify(objevent);

        const options = {
            hostname: 'script.google.com',
            port: 443,
            path: BOTCONFIG.GASURL.replace('https://script.google.com', ''),
            method: 'POST',
            timeout: 1000 * 60 * 5, // Google Apps script execution limit is 5 minutes
            //followAllRedirects: true,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            dtcon.log(`STATUS: ${res.statusCode}`);
            res.setEncoding('utf-8');
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                dtcon.log('No more data in response.');
                dtcon.log('Response body: ' + responseBody);
                resolve(responseBody);
            });
        });

        req.on('error', (e) => {
            dtcon.error(`problem with request: ${JSON.stringify(e, null, 2)}`);
            reject(e);
        });

        // Write data to request body
        req.write(postData);
        req.end();
    });
    return promise;
}

// vim:set et sw=4 ts=4:
