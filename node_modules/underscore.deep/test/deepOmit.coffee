assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')
h = require './helpers'

describe '_.deepOmit', ->

  h.it_throws_on_non_objects (input) -> _.deepOmit input, []

  _.each [
    [{},                      ['a'],            {}]
    [{ a: 1 },                ['a'],            {}]
    [{ a: 1 },                [],               { a: 1 }]
    [{ a: 1 },                ['b'],            { a: 1 }]
    [{ a: 1, b: 1 },          ['a'],            { b: 1 }]
    [{ a: { b: 1 }},          ['a.b'],          { a: {} }]
    [{ a: { b: 1 }},          ['a'],            {}]
    [{ a: { b: 1 }},          ['a.b', 'a'],     {}]
    [{ a: { b: 1 }},          ['a', 'a.b'],     {}]
    [{ a: { b: 1, c: 'c' }},  ['a.c'],          { a: { b: 1 }}]
    [{ a: { b: { c: null }}}, ['a.b.c'],        { a: { b: {}}}]
    [{ a: { b: { c: null }}}, ['a.b.c', 'a.b'], { a: {}}]
    [{ long: { longer: {}}},  ['long.longer'],  { long: {}}]
  ], ([obj, keys, expected]) ->
    it "returns #{JSON.stringify expected} for object: #{JSON.stringify obj}, keys: #{JSON.stringify keys}", ->
      assert.deepEqual _.deepOmit(obj, keys), expected
