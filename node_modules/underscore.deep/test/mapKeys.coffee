assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')
h = require './helpers'

describe '_.mapKeys', ->
  h.it_throws_on_non_objects (input) -> _.mapKeys input, (key) -> key

  it "maps over an empty object", ->
    res = _.mapKeys {}, (key) -> assert.fail "shouldn't have called map fn"
    assert.deepEqual res, {}

  it "maps add1 over an object", ->
    res = _.mapKeys { a: 1, b: 2 }, (key) -> key + '_'
    assert.deepEqual res, { a_: 1, b_: 2 }

  it "passes vals to the map fn", ->
    res = _.mapKeys { a: 1, b: 2 }, (key, val) -> key + val
    assert.deepEqual res, { a1: 1, b2: 2 }
