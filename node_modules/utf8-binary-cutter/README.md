utf8-binary-cutter
==================

[![a cutter](https://raw.githubusercontent.com/lemonde/utf8-binary-cutter/master/doc/1390-Straight-cutter-18mm.jpg)](https://github.com/lemonde/utf8-binary-cutter)

A small node.js lib to truncate UTF-8 strings to a given binary size. Useful when dealing with old systems handling UTF-8 as ascii/latin-1, for ex. MySQL or Oracle database.

Interesting reads :
* [About MySQL, UTF-8 and saving headaches](http://melp.nl/2011/01/about-mysql-utf-8-and-saving-headaches/)
* [Getting out of MySQL Character Set Hell](https://www.bluebox.net/insight/blog-article/getting-out-of-mysql-character-set-hell)

Usage
=====
* Works on UTF-8 strings (javascript strings are UTF-8 unless you're doing fancy things)

```javascript
var Cutter = require('utf8-binary-cutter');
```

* `getBinarySize()` : returns the binary size of the given string

```javascript
var utf8String = 'abc☃☃☃'; // abc then 3 times the UTF-8 « snowman » char which takes 3 bytes

console.log( Cutter.getBinarySize( utf8String ) );  // 12 = 1 + 1 + 1 + 3 + 3 + 3
```

* `truncateToBinarySize()` truncate so that final binary size is lower or equal than the given limit :

```javascript
var utf8String = 'abc☃☃☃'; // abc then 3 times the UTF-8 « snowman » char which takes 3 bytes

console.log( Cutter.truncateToBinarySize( utf8String, 20 ) ); // 'abc☃☃☃'  -> no change
console.log( Cutter.truncateToBinarySize( utf8String, 12 ) ); // 'abc☃☃☃'  -> no change
console.log( Cutter.truncateToBinarySize( utf8String, 11 ) ); // 'abc☃...' -> to avoid cutting utf8 chars,
  // the two last snowmen had to be removed. Final size = 9 bytes
console.log( Cutter.truncateToBinarySize( utf8String, 10 ) ); // 'abc☃...' -> idem
console.log( Cutter.truncateToBinarySize( utf8String,  9 ) ); // 'abc☃...' -> idem
console.log( Cutter.truncateToBinarySize( utf8String,  8 ) ); // 'abc...'
```

* `truncateFieldsToBinarySize()` multiple truncations at the same time :
  * NOTE : returns a new object.
  * NOTE : iterates only on own properties
  * NOTE : only truncated strings are copied, other members are shared with original object.

```javascript
var maxBinarySizes = {
  title: 40,
  content: 200
};

console.log( Cutter.truncateFieldsToBinarySize({
    title: '☃☃☃ A véry véry long title with UTF-8 ☃☃☃',
    content: 'I ❤ utf8-binary-cutter !',
    foo: 42
  },
  maxBinarySizes
));

--> {
  title: '☃☃☃ A véry véry long title wi...',
  content: 'I ❤ utf8-binary-cutter !',
  foo: 42
}
```


* `truncateToCharLength()` normal truncate is also provided for convenience : truncate so that final char length is lower or equal than the given limit :

```javascript
var utf8String = 'abc☃☃☃'; // 6 chars

console.log( Cutter.truncateToCharLength( utf8String, 10 ) ); // 'abc☃☃☃'  -> no change
console.log( Cutter.truncateToBinarySize( utf8String,  6 ) ); // 'abc☃☃☃'  -> no change
console.log( Cutter.truncateToBinarySize( utf8String,  5 ) ); // 'ab...'   -> 5 chars, ok
```

* optional callback when truncating (useful for logging) :

```
truncateToBinarySize(foo, 42, function(maxBinarySize, originalString, truncatedString) {
  logger.warn(...
});

truncateToCharLength(foo, 42, function(maxCharLength, originalString, truncatedString) {
  logger.warn(...
});

Cutter.truncateFieldsToBinarySize({
    title: '☃☃☃ A véry véry long title with UTF-8 ☃☃☃',
    content: 'I ❤ utf8-binary-cutter !',
    foo: 42
  },
  // maxBinarySizes
  {
    title: 40,
    content: 200
  },
  // callback
  // will be called for each member truncated.
  // 4th param : the key of the member being truncated.
  function(maxCharLength, originalString, truncatedString, key) {
    logger.warn(...
  }
);

```

Contributing
============
* clone repo
* ensure your editor is decent and pick up the `.editorconfig` and `.jshintrc` files
* `npm install`
* `npm test`
* add tests, add features, send a PR

Thanks !