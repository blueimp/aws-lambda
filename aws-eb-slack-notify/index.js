/*
 * AWS Elastic Beanstalk Slack Notify function for AWS Lambda
 * https://github.com/blueimp/aws-lambda
 *
 * Copyright 2015, Sebastian Tschan
 * https://blueimp.net
 *
 * Based on the Gist turret-io/slackNotify.js
 * https://gist.github.com/turret-io/65a10f7ea14d3e308dd9
 *
 * Licensed under the MIT license:
 * http://opensource.org/licenses/MIT
 */

// Replace the following with your own Slack Webhook path:
var slackWebhookPath = '/services/your/slack/hook';

var requestOptions = {
  hostname: 'hooks.slack.com',
  port: 443,
  path: slackWebhookPath,
  method: 'POST'
};

function parseSNSPayload(payload) {
  parts = payload.Records[0].Sns.Message.split('\n');
  data = {};
  parts.forEach(function(part) {
    if (!part.length) {
      return;
    }
    key = part.split(':', 1)[0];
    value = part.split(key+': ').reverse()[0];
    data[key] = value;
  });
  return data;
}

function generateAttachmentFields(data, excludeKeys, shortKeys) {
  var fields = [];
  Object.keys(data).forEach(function(key){
    if (excludeKeys.indexOf(key) != -1) {
      return;
    }
    fields.push({
      'title': key,
      'value': data[key],
      'short': shortKeys.indexOf(key) != -1
    });
  });
  return fields;
}

function generateRequestData(event) {
  var data = parseSNSPayload(event);
  return {
    attachments: [{
      fallback: data.Message,
      title: data.Message,
      fields: generateAttachmentFields(data, [
        'RequestId',
        'NotificationProcessId',
        'Message',
        'Timestamp'
      ], [
        'Environment',
        'Application'
      ])
    }]
  };
}

exports.handler = function(event, context) {
  var req = require('https').request(requestOptions, function(res) {
    var body = '';
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers));
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      if (res.headers['content-type'] === 'application/json') {
        body = JSON.parse(body);
      }
      context.succeed(body);
    });
  });
  req.on('error', context.fail);
  req.write(JSON.stringify(generateRequestData(event)));
  req.end();
};
