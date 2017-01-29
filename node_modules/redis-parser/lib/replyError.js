'use strict'

var util = require('util')
var RedisError = require('./redisError')

function ReplyError (message, newLimit) {
  var limit = Error.stackTraceLimit
  Error.stackTraceLimit = newLimit || 2
  RedisError.call(this, message)
  Error.stackTraceLimit = limit
}

util.inherits(ReplyError, RedisError)

Object.defineProperty(ReplyError.prototype, 'name', {
  value: 'ReplyError',
  writable: true
})

module.exports = ReplyError
