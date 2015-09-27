/*
 * Docker Hub Slack Notify function for AWS Lambda
 * https://github.com/blueimp/aws-lambda
 *
 * Copyright 2015, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://opensource.org/licenses/MIT
 */

// Replace the following with your own Slack Webhook path:
var slackWebhookPath = '/services/your/slack/hook';

var template = '{push_data.pusher} pushed to ' +
        '<{repository.repo_url}|{repository.repo_name}>.';

var requestOptions = {
    hostname: 'hooks.slack.com',
    port: 443,
    path: slackWebhookPath,
    method: 'POST'
};

function getNestedProperty(obj, property) {
    property.replace(
        // Matches native JavaScript notation in a String,
        // e.g. '["doubleQuoteProp"].dotProp[2]'
        /\[(?:'([^']+)'|"([^"]+)"|(\d+))\]|(?:(?:^|\.)([^\.\[]+))/g,
        function (str, singleQuoteProp, doubleQuoteProp, arrayIndex, dotProp) {
            var prop = dotProp || singleQuoteProp || doubleQuoteProp ||
                (arrayIndex && parseInt(arrayIndex, 10));
            if (str && obj) {
                obj = obj[prop];
            }
        }
    );
    return obj;
}

function compileTemplate(template, data) {
    return template.replace(
        /\{(.+?)\}/g,
        function (match, property) {
            return getNestedProperty(data, property);
        }
    );
}

function generateRequestData(template, event) {
    return {
        text: compileTemplate(template, event)
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
            console.log('Successfully processed HTTPS response');
            if (res.headers['content-type'] === 'application/json') {
                body = JSON.parse(body);
            }
            context.succeed(body);
        });
    });
    req.on('error', context.fail);
    req.write(JSON.stringify(generateRequestData(template, event)));
    req.end();
};
