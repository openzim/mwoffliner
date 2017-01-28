assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')
h = require './helpers'

describe '_.mapValues', ->
  h.it_throws_on_non_objects (input) -> _.mapValues input, (v) -> v

  it "maps over an empty object", ->
    res = _.mapValues {}, (val) -> assert.fail "shouldn't have called map fn"
    assert.deepEqual res, {}

  it "maps add1 over an object", ->
    res = _.mapValues { a: 1, b: 2 }, (val) -> val + 1
    assert.deepEqual res, { a: 2, b: 3 }

  it "passes keys to the map fn", ->
    res = _.mapValues { a: 1, b: 2 }, (val, key) -> val + key
    assert.deepEqual res, { a: '1a', b: '2b' }
