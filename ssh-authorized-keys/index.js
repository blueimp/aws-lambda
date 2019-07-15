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

// eslint-disable-next-line node/no-unpublished-require
const AWS = require('aws-sdk')
const IAM = new AWS.IAM()

const GROUP = process.env.group || 'ssh'

/**
 * Retrievs the group users
 *
 * @param {string} groupName Group name
 * @returns {Promise<Array>} Resolves with the group users
 */
function getGroupUsers(groupName) {
  return IAM.getGroup({
    GroupName: groupName
  })
    .promise()
    .then(data => data.Users.map(user => user.UserName))
}

/**
 * Retrievs the public SSH key IDs of the user
 *
 * @param {string} userName User name
 * @returns {Promise<Array>} Resolves with the public SSH key IDs
 */
function getSSHPublicKeyIDs(userName) {
  return IAM.listSSHPublicKeys({
    UserName: userName
  })
    .promise()
    .then(data =>
      data.SSHPublicKeys.reduce((ids, key) => {
        if (key.Status === 'Active') return [...ids, key.SSHPublicKeyId]
        return ids
      }, [])
    )
}

/**
 * Retrievs the public SSH key of the user and key
 *
 * @param {string} userName User name
 * @param {string} keyID Key ID
 * @returns {Promise<string>} Resolves with the public SSH key
 */
function getSSHPublicKey(userName, keyID) {
  return IAM.getSSHPublicKey({
    Encoding: 'SSH',
    UserName: userName,
    SSHPublicKeyId: keyID
  })
    .promise()
    .then(data => data.SSHPublicKey.SSHPublicKeyBody)
}

/**
 * Retrievs the public SSH keys of the user
 *
 * @param {string} userName User name
 * @returns {Promise<Array>} Resolves with the public SSH keys
 */
function getSSHPublicKeys(userName) {
  return getSSHPublicKeyIDs(userName).then(keyIDs => {
    return Promise.all(keyIDs.map(keyID => getSSHPublicKey(userName, keyID)))
  })
}

/**
 * Retrievs the public SSH keys of the group users
 *
 * @param {string} group User group
 * @returns {Promise<Array>} Resolves with the public SSH keys
 */
function getGroupSSHPublicKeys(group) {
  return getGroupUsers(group)
    .then(users => {
      // eslint-disable-next-line no-console
      console.log('Users:', JSON.stringify(users))
      return Promise.all(users.map(userName => getSSHPublicKeys(userName)))
    })
    .then(keySets =>
      keySets.reduce((keys, keySet) => {
        return keys.concat(keySet)
      }, [])
    )
}

exports.handler = (event, context, callback) => {
  // eslint-disable-next-line no-console
  console.log('Event:', JSON.stringify(event))
  // eslint-disable-next-line no-console
  console.log('Group:', GROUP)
  getGroupSSHPublicKeys(GROUP)
    .then(keys => {
      // eslint-disable-next-line no-console
      console.log('Keys count:', keys.length)
      callback(null, {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: keys.join('\n') + '\n'
      })
    })
    .catch(err => callback(err))
}
