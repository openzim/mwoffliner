assert = require 'assert'
_ = require 'underscore'
{inspect} = require 'util'

module.exports =
  it_throws_on_non_objects: (fn) ->
    _.each [
      undefined
      null
      String
      1
      'Stringy McString-String'
      true
      /Regex McReg/
      new Error('not a plain obj')
      [1, 2, 3]
    ], (non_object) ->
      it "throws if given non-object #{inspect non_object}", ->
        assert.throws (-> fn non_object), /must be called on an object/
