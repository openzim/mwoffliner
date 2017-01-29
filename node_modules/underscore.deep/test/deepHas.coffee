assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')

describe '_.deepHas', ->

  test_obj =
    a:
      b: 1
      c: 2
    d: e: f: 3
  tests = [
    [{},        'a',        false]
    [{},        '',         false]
    [{ a: {} }, 'a',        true]
    [{ a: {} }, 'a.b',      false]
    [test_obj,  'a',        true]
    [test_obj,  'a.b',      true]
    [test_obj,  ['a', 'b'], true]
    [test_obj,  'd.e.f',    true]
    [test_obj,  [],         false]
    [test_obj,  '',         false]
    [test_obj,  'a.b.x',    false]
    [test_obj,  'a.e',      false]
    [test_obj,  'x',        false]
  ]
  _(tests).each ([obj, key, output]) ->
    it "returns #{output} for object: #{JSON.stringify obj}, key: #{key}", ->
      assert.equal _.deepHas(obj, key), output
