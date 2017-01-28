assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')
h = require './helpers'

describe '_.deepMapValues', ->
  h.it_throws_on_non_objects (input) -> _.deepMapValues input, (v) -> v

  it "maps over an empty object", ->
    res = _.deepMapValues {}, (val) -> assert.fail "shouldn't have called map fn"
    assert.deepEqual res, {}

  it "maps add1 over a flat object", ->
    res = _.deepMapValues { a: 1, b: 2 }, (val) -> val + 1
    assert.deepEqual res, { a: 2, b: 3 }

  it "maps add1 over a deep object", ->
    res = _.deepMapValues { a: { b: 1, c: 2 }, d: e: f: 3 }, (val) -> val + 1
    assert.deepEqual res, { a: { b: 2, c: 3 }, d: e: f: 4 }

  it "also passes keys", ->
    res = _.deepMapValues { a: { b: 1, c: 2 }, d: e: f: 3 }, (val, key) ->
      val = if 'a' in key then 0 else val
    assert.deepEqual res, { a: { b: 0, c: 0 }, d: e: f: 3 }

  it "passes keys correctly", ->
    _.deepMapValues {a: {b: {c: 'a.b.c'}, d:'a.d'}, e: 'e', f: g: h: 'f.g.h'}, (val, key) ->
      assert.equal val, key
