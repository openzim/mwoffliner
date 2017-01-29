assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')
h = require './helpers'

permutations = (arr) ->
  if _.isEmpty arr
    [[]]
  else
    perms_per_elt = _.map arr, (elt, i) ->
      subperms = permutations arr[...i].concat arr[i+1...]
      _.map subperms, (subperm) -> [elt].concat subperm
    _.flatten perms_per_elt, true

describe '_.deepPick', ->

  h.it_throws_on_non_objects (input) -> _.deepPick input, []

  _.each [
    [{},                      ['a'],            {}]
    [{ a: 1 },                ['a'],            { a: 1 }]
    [{ a: 1 },                [],               {}]
    [{ a: 1 },                ['b'],            {}]
    [{ a: 1, b: 1 },          ['a'],            { a: 1 }]
    [{ a: { b: 1 }},          ['a.b'],          { a: { b: 1 }}]
    [{ a: { b: 1 }},          ['a'],            { a: { b: 1 }}]
    [{ a: { b: 1 }},          ['a.b', 'a'],     { a: { b: 1 }}]
    [{ a: 1 },                ['a.b.c'],        {}]
    [{ a: { b: 1, c: 'c' }},  ['a.c'],          { a: { c: 'c' }}]
    [{ a: { b: { c: null }}}, ['a.b'],          { a: { b: { c: null }}}]
    [{ long: { longer: {}}},  ['long.longer'],  { long: { longer: {}}}]
    [{ a: {}, b: { c: 'c' }}, ['b.c'],          { b: { c: 'c' }}]
    [{ a: { b: { c: 1, d: 1 }}},  ['a.b.c'],                  { a: { b: { c: 1 }}}]
    [{ a: { b: { c: 1, d: 1 }}},  ['a.b', 'a.b.c'],           { a: { b: { c: 1, d: 1 }}}]
    [{ a: { b: { c: 1, d: 1 }}},  ['a', 'a.b', 'a.b.c'],      { a: { b: { c: 1, d: 1 }}}]
    [{ a: { b: { c: 1, d: 1 }}},  ['a', 'a.b', 'a.b.c', 'a.b.d'], { a: { b: { c: 1, d: 1 }}}]
    [{ a: { b: { c: 1, d: 1 }}},  ['a.b', 'a.b.c', 'a.b.d'],  { a: { b: { c: 1, d: 1 }}}]
  ], ([obj, keys, expected]) ->
    _.each permutations(keys), (keys) ->
      it "returns #{JSON.stringify expected} for object: #{JSON.stringify obj}, keys: #{JSON.stringify keys}", ->
        assert.deepEqual _.deepPick(obj, keys), expected
