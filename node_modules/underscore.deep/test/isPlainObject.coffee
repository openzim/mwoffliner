assert = require 'assert'
_ = require('underscore')
_.mixin require('../underscore.deep.js')

describe '_.isPlainObject', ->

  tests = [
    [{},        true]
    [{ a: 1 },  true]
    [(->),      false]
    [[],        false]
    [[1,2],     false]
    ["object",  false]
    [1,         false]
    [/a/,       false]
    [new Date(),false]
    [null,      false]
    [undefined, false]
  ]
  _(tests).each ([input, output]) ->
    it "returns #{output} for value #{input}", ->
      assert.equal _.isPlainObject(input), output
