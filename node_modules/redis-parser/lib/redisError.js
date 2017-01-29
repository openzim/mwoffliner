'use strict'

var util = require('util')

function RedisError (message) {
  Error.call(this, message)
  Error.captureStackTrace(this, this.constructor)
  Object.defineProperty(this, 'message', {
    value: message || '',
    writable: true
  })
}

util.inherits(RedisError, Error)

Object.defineProperty(RedisError.prototype, 'name', {
  value: 'RedisError',
  writable: true
})

module.exports = RedisError
