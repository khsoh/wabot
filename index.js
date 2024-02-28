'use strict';

const Constants = require('whatsapp-web.js/src/util/Constants');

module.exports = {
    Client: require('whatsapp-web.js/src/Client'),
    
    version: require('whatsapp-web.js/package.json').version,

    // Structures
    Chat: require('whatsapp-web.js/src/structures/Chat'),
    PrivateChat: require('whatsapp-web.js/src/structures/PrivateChat'),
    GroupChat: require('whatsapp-web.js/src/structures/GroupChat'),
    Message: require('whatsapp-web.js/src/structures/Message'),
    MessageMedia: require('whatsapp-web.js/src/structures/MessageMedia'),
    Contact: require('whatsapp-web.js/src/structures/Contact'),
    PrivateContact: require('whatsapp-web.js/src/structures/PrivateContact'),
    BusinessContact: require('whatsapp-web.js/src/structures/BusinessContact'),
    ClientInfo: require('whatsapp-web.js/src/structures/ClientInfo'),
    Location: require('whatsapp-web.js/src/structures/Location'),
    Poll: require('whatsapp-web.js/src/structures/Poll'),
    ProductMetadata: require('whatsapp-web.js/src/structures/ProductMetadata'),
    List: require('whatsapp-web.js/src/structures/List'),
    Buttons: require('whatsapp-web.js/src/structures/Buttons'),
    
    // Auth Strategies
    NoAuth: require('whatsapp-web.js/src/authStrategies/NoAuth'),
    LocalAuth: require('whatsapp-web.js/src/authStrategies/LocalAuth'),
    RemoteAuth: require('whatsapp-web.js/src/authStrategies/RemoteAuth'),
    LegacySessionAuth: require('whatsapp-web.js/src/authStrategies/LegacySessionAuth'),
    
    ...Constants
};
