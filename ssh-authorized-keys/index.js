/*
 * AWS Lambda function to return authorized keys for EC2 SSH access.
 * https://github.com/blueimp/aws-lambda
 *
 * Optional environment variables:
 * - group: The IAM group of users authorized for SSH access, defaults to "ssh".
 *
 * Meant to be used with Amazon API Gateway
 *
 * Copyright 2017, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 */

'use strict'

const AWS = require('aws-sdk')
const IAM = new AWS.IAM()

const GROUP = process.env.group || 'ssh'

function getGroupUsers (groupName) {
  return IAM.getGroup({
    GroupName: groupName
  }).promise().then(data => data.Users.map(user => user.UserName))
}

function getSSHPublicKeyIDs (userName) {
  return IAM.listSSHPublicKeys({
    UserName: userName
  }).promise().then(data => data.SSHPublicKeys.reduce((ids, key) => {
    if (key.Status === 'Active') return [...ids, key.SSHPublicKeyId]
    return ids
  }, []))
}

function getSSHPublicKey (userName, keyID) {
  return IAM.getSSHPublicKey({
    Encoding: 'SSH',
    UserName: userName,
    SSHPublicKeyId: keyID
  }).promise().then(data => data.SSHPublicKey.SSHPublicKeyBody)
}

function getSSHPublicKeys (userName) {
  return getSSHPublicKeyIDs(userName).then(keyIDs => {
    return Promise.all(keyIDs.map(keyID => getSSHPublicKey(userName, keyID)))
  })
}

function getGroupSSHPublicKeys (group) {
  return getGroupUsers(group).then(users => {
    console.log('Users:', JSON.stringify(users))
    return Promise.all(users.map(userName => getSSHPublicKeys(userName)))
  }).then(keySets => keySets.reduce((keys, keySet) => {
    return keys.concat(keySet)
  }, []))
}

exports.handler = (event, context, callback) => {
  console.log('Event:', JSON.stringify(event))
  console.log('Group:', GROUP)
  getGroupSSHPublicKeys(GROUP).then(keys => {
    console.log('Keys count:', keys.length)
    callback(null, {
      statusCode: 200,
      headers: {'Content-Type': 'text/plain'},
      body: keys.join('\n') + '\n'
    })
  }).catch(err => callback(err))
}
