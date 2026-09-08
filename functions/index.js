'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { makeWardHandler } = require('./handler');

// Uses Application Default Credentials supplied by Cloud Functions. Never add a key file here.
initializeApp();
const cors = ['https://ward-cafe-nine.vercel.app'];
if (process.env.FUNCTIONS_EMULATOR === 'true') cors.push(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);

exports.wardAction = onCall({
    region: process.env.WARD_FUNCTIONS_REGION || 'europe-west1',
    enforceAppCheck: true,
    cors,
    timeoutSeconds: 30,
    memory: '256MiB',
    minInstances: 0,
    maxInstances: 10,
    concurrency: 20
}, makeWardHandler({ auth: getAuth(), database: getDatabase(), HttpsError, logger }));

// Numeric staff login and administration services.
Object.assign(exports, require('./numeric-services'));
