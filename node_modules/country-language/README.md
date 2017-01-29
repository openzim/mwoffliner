country-language
==========

> Query any country's spoken languages or countries where a language is spoken.

## Installation

### Node.js

`country-language` is available on [npm](https://www.npmjs.org/package/country-language).

    $ npm install country-language

## Usage

Once you require `country-language`, the following API will be available.

```js
var CountryLanguage = require('country-language');
```

### .getLanguageCodes (languageCodeType, cb)

* **@param** _{String}_ language code type. Acceptable values: 1, 2 or 3.
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ array String with language codes

Acceptable language code type parameter values: 1, 2, 3 for returning ISO-639-1, ISO-639-2, ISO-639-3 codes respectively.
If not provided, ISO-639-1 codes will be returned.

```js
var allLanguageCodes = CountryLanguage.getLanguageCodes(2);
```

### .getCountryCodes (countryCodeType, cb)

* **@param** _{String}_ country code type. Acceptable values: 1, 2 or 3.
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ array String with country codes

Acceptable country code type parameter values: 1, 2, 3 for returning numerical code, alpha-2, alpha-3 codes respectively.
If not provided, alpha-2 codes will be returned.

```js
var allCountryCodes = CountryLanguage.getCountryCodes(2);
```

### .languageCodeExists (languageCode)

* **@param** _{String}_ language code to check.

Returns Boolean indicating language existance.
Language code parameter can be either a ISO-639-1, ISO-639-2 or ISO-639-3 code.

```js
var languageExists = CountryLanguage.languageCodeExists('en');
```

### .countryCodeExists (countryCode)

* **@param** _{String}_ country code to check.

Returns Boolean indicating country existance.
Country code parameter can be either an alpha-2, alpha-3 or numerical code.

```js
var countryExists = CountryLanguage.countryCodeExists('GB');
```

### .getCountry (code, cb)

* **@param** _{String}_ country code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object containing country info

Country code can be either an Alpha-2 or Alpha-3 code.
The returned object includes the following info:

* ```code_2```: Country alpha-2 code (2 letters)
* ```code_3```: Country alpha-3 code (3 letters)
* ```numCode```: Country numeric code
* ```name```: Country name
* ```languages```: Array of language objects for each language spoken in the country
* ```langCultureMs```: Array of language cultures for the country supported by Microsoft©

Each language object in ```languages``` property includes the following info:

* ```iso639_1```: language iso639-1 code (2 letters)
* ```iso639_2```: language iso639-2 code (3 letters)
* ```iso639_2en```: language iso639-2 code with some codes derived from English names rather than native names of languages (3 letters)
* ```iso639_3```: language iso639-3 code (3 letters)
* ```name```: String array with one or more language names (in English)
* ```nativeName```: String array with one or more language names (in native language)
* ```direction```: Language script direction (either 'LTR' or 'RTL') - Left-to-Right, Right-to-Left
* ```family```: language family
* ```countries```: Array of country objects where this language is spoken

Each Microsoft© language culture object in ```langCultureMs``` property icludes the following info:

* ```langCultureName```: language culture name
* ```displayName```: language culture dispaly name
* ```cultureCode```: language culture code

```js
CountryLanguage.getCountry('GB', function (err, country) {
  if (err) {
    console.log(err);
  } else {
    var languagesInGB = country.languages;
  }
});
```

### .getLanguage (code, cb)

* **@param** _{String}_ language code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object containing language info

Language code can be either iso639-1, iso639-2, iso639-2en or iso639-3 code.
Contents of the returned language object are described in **```.getCountry```** method.

```js
CountryLanguage.getLanguage('en', function (err, language) {
  if (err) {
    console.log(err);
  } else {
    var countriesSpeakingEN = language.countries;
  }
});
```

### .getCountryLanguages (code, cb)

* **@param** _{String}_ country code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object array containing country languages info

Country code can be either an Alpha-2 or Alpha-3 code.
Each language object contains the following info:

* ```iso639_1```: language iso639-1 code (2 letters)
* ```iso639_2```: language iso639-2 code with some codes derived from English names rather than native names of languages (3 letters)
* ```iso639_3```: language iso639-3 code (3 letters)

```js
CountryLanguage.getCountryLanguages('GB', function (err, languages) {
  if (err) {
    console.log(err);
  } else {
    languages.forEach(function (languageCodes) {
      console.log(languageCodes.iso639_1);
    });
  }
});
```

### .getLanguageCountries (code, cb)

* **@param** _{String}_ language code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object array containing country info

Language code can be either iso639-1, iso639-2, iso639-2en or iso639-3 code.
Each Country object contains the following info:

* ```code_2```: Country alpha-2 code (2 letters)
* ```code_3```: Country alpha-3 code (3 letters)
* ```numCode```: Country numeric code

```js
CountryLanguage.getLanguageCountries('en', function (err, countries) {
  if (err) {
    console.log(err);
  } else {
    countries.forEach(function (countryCodes) {
      console.log(countryCodes.code_3);
    });
  }
});
```

### .getCountryMsLocales (code, cb)

* **@param** _{String}_ country code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object array containing Language Cultures info for the country

Country code can be either an Alpha-2 or Alpha-3 code.
Contents of each Language Culture object are described in **```.getCountry```** method.

```js
CountryLanguage.getCountryMsLocales('GB', function (err, locales) {
  if (err) {
    console.log(err);
  } else {
    locales.forEach(function (locale) {
      console.log(locale.langCultureName);
    });
  }
});
```

### .getLanguageMsLocales (code, cb)

* **@param** _{String}_ language code
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object array containing Language Cultures info for the language

Language code can be either iso639-1, iso639-2, iso639-2en or iso639-3 code.
Contents of each Language Culture object are described in **```.getCountry```** method.

```js
CountryLanguage.getLanguageMsLocales('en', function (err, locales) {
  if (err) {
    console.log(err);
  } else {
    locales.forEach(function (locale) {
      console.log(locale.langCultureName);
    });
  }
});
```

### .getCountries ()

Returns an array object with info for every country in the world having an ISO 3166 code.
Contents of each country object in the array is described in **```.getCountry```** method.

```js
var allCountries = CountryLanguage.getCountries();
```

### .getLanguages ()

Returns an array object with info for every language in the world having an ISO 639-2 code (and a few more).
Contents of each language object in the array is described in **```.getCountry```** method.

```js
var allLanguages = CountryLanguage.getLanguages();
```

### .getLanguageFamilies ()

Returns an array of strings with the names of each language family.

```js
var allLanguageFamilies = CountryLanguage.getLanguageFamilies();
```

### .getLocales (mode)

* **@param** _{Boolean}_ locale symbols mode

Returns an array of strings with all locale codes.
If mode ommited or false, locales with 3 parts will be returned like: **az-Cyrl-AZ**

If mode is set to true, they will be returned like: **az-AZ-Cyrl**

```js
var localesSymbols = CountryLanguage.getLocales();
var localesSymbols = CountryLanguage.getLocales(true);
```
### .getLanguageFamilyMembers (family, cb)

Returns an array object with info for every language in the world having an ISO 639-2 code (and a few more).
Contents of each language object in the array is described in **```.getCountry```** method.

* **@param** _{String}_ language family name (
* **@param** _{Function}_ callback on complete or error
* **@cb** _{Error|null}_ if error
* **@cb** _{Object}_ object array containing languages info for each language member in the family.

Contents of the returned language object are described in **```.getCountry```** method.

```js
CountryLanguage.getLanguageFamilyMembers('Indo-European', function (err, languages) {
  if (err) {
    console.log(err);
  } else {
    languages.forEach(function (language) {
      console.log(language.name);
    });
  }
});
```
<br />
## Notes

For the following methods:

* **.getLanguageCodes**
* **.getCountryCodes**
* **.getCountry**
* **.getLanguage**
* **.getCountryLanguages**
* **.getLanguageCountries**
* **.getCountryMsLocales**
* **.getLanguageMsLocales**
* **.getLanguageFamilyMembers**

the ```cb``` parameter is optional. When not provided, each method returns either an Object when there is no error, or a String in case of an error.
<br/>
<br/>
<br/>
Any input parameter (country code, language code, language family name) is case insensitive.
<br/>
<br/>
<br/>
```Language#nativeName``` string is not displayed correclty on the console for Right-to-Left (RTL) languages. However, there is no issue on string rendering (either on the browser or any text editor).

# License

Copyright (c) 2014 BDSwiss

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
