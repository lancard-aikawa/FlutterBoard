'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

exports.helloWorld = onRequest((request, response) => {
  logger.info('helloWorld called', { structuredData: true });
  response.json({ message: 'Hello from Firebase Functions!' });
});
