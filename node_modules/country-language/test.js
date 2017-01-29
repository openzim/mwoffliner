var lib = require('./index.js');

console.log('~~~~~~~~~~~~~ getCountries');
console.log(lib.getCountries());

console.log('~~~~~~~~~~~~~ getLanguages');
console.log(lib.getLanguages());

console.log('~~~~~~~~~~~~~ getLanguageFamilies');
console.log(lib.getLanguageFamilies());

console.log('~~~~~~~~~~~~~ getCountry');
console.log(lib.getCountry('IN'));

console.log('~~~~~~~~~~~~~ getLanguage');
console.log(lib.getLanguage('en'));

console.log('~~~~~~~~~~~~~ getCountryLanguages');
console.log(lib.getCountryLanguages('IN'));

console.log('~~~~~~~~~~~~~ getLanguageCountries');
console.log(lib.getLanguageCountries('en'));

console.log('~~~~~~~~~~~~~ getCountryMsLocales');
console.log(lib.getCountryMsLocales('in'));

console.log('~~~~~~~~~~~~~ getLanguageMsLocales');
console.log(lib.getLanguageMsLocales('en'));

console.log('~~~~~~~~~~~~~ getLanguageFamilyMembers');
console.log(JSON.stringify(lib.getLanguageFamilyMembers('Austronesian'), null, 2));

console.log('~~~~~~~~~~~~~ getLanguageCodes');
console.log(JSON.stringify(lib.getLanguageCodes('3'), null, 2));

console.log('~~~~~~~~~~~~~ getCountryCodes');
console.log(JSON.stringify(lib.getCountryCodes(), null, 2));

console.log('~~~~~~~~~~~~~ languageCodeExists');
console.log(JSON.stringify(lib.languageCodeExists('en'), null, 2));

console.log('~~~~~~~~~~~~~ countryCodeExists');
console.log(JSON.stringify(lib.countryCodeExists('gr'), null, 2));

console.log('~~~~~~~~~~~~~ getLocales()');
console.log(JSON.stringify(lib.getLocales(), null, 2));

console.log('~~~~~~~~~~~~~ getLocales(true)');
console.log(JSON.stringify(lib.getLocales(true), null, 2));
