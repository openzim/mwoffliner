#!/bin/bash
# Tests for mwmatrixoffliner.
# Add tests in the lower section.

# getOutputAndClean runs mwmatrixoffliner in dry-run mode with the passed arguments,
# captures the output, and trims the path.
base_args="--dryRun --verbose --mwUrl=https://meta.wikimedia.org/ --adminEmail=foo@bar.net"
getOutputAndClean() {
  ./mwmatrixoffliner.script.js $base_args $* | grep "Executing" | sed 's/.*mwoffliner.script.js/mwoffliner.script.js/'
}

# runTest runs a single test based on an array of arguments and the expected set of
# arguments to mwoffliner. It prints the test name and either PASSED or FAILED. If
# the test failed it outputs what it received and what it expected.
runTest() {
  test_name=$1
  test_args=$2
  want=$3
  got=$(getOutputAndClean ${test_args[@]})
  echo $test_name
  if [[ ${got} == ${want} ]]
  then echo "PASSED"
  else echo "FAILED"
       echo "got:"
       echo "$got" # Double quotes to avoid losing newlines during Word Splitting
       echo "want:"
       echo "$want"
  fi
}

# The tests
name=MobileLayout
test_args=( --project=wiki --mobileLayout --language=es )
want="mwoffliner.script.js --mwUrl=https://es.wikipedia.org/ --parsoidUrl=https://es.wikipedia.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose --mobileLayout"
runTest $name $test_args "$want"

name=MultipleLanguages
test_args=( --project=wikivoyage --language="(de|en|fr)" )
want="mwoffliner.script.js --mwUrl=https://de.wikivoyage.org/ --parsoidUrl=https://de.wikivoyage.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose
mwoffliner.script.js --mwUrl=https://en.wikivoyage.org/ --parsoidUrl=https://en.wikivoyage.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose
mwoffliner.script.js --mwUrl=https://fr.wikivoyage.org/ --parsoidUrl=https://fr.wikivoyage.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose"
runTest $name $test_args "$want"

name=LanguageInversion
# To keep the test manageable, exclude all language codes starting with 'a' through 't'.
# This test could easily get out of date if languages are added to wikibooks.
test_args=( --project=wikibooks --languageInverter --language="(af|ar|as|az|ba|be|bg|bn|br|bs|bz|ca|cs|cv|cy|da|de|el|en|eo|es|et|eu|fa|fi|fo|fr|fy|gl|gu|he|hi|hr|hu|hy|ia|id|is|it|ja|ka|kk|km|kn|ko|ku|ky|la|li|lt|mg|mk|ml|ms|mr|ne|nl|no|oc|or|pa|pl|pms|pt|ro|ru|sa|sah|si|sk|sl|sq|sr|sv|ta|te|tg|th|tl|tr|tt)" )
want="mwoffliner.script.js --mwUrl=https://uk.wikibooks.org/ --parsoidUrl=https://uk.wikibooks.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose
mwoffliner.script.js --mwUrl=https://ur.wikibooks.org/ --parsoidUrl=https://ur.wikibooks.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose
mwoffliner.script.js --mwUrl=https://vi.wikibooks.org/ --parsoidUrl=https://vi.wikibooks.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose
mwoffliner.script.js --mwUrl=https://zh.wikibooks.org/ --parsoidUrl=https://zh.wikibooks.org/api/rest_v1/page/html/ --adminEmail=foo@bar.net --format=novid --format=nopic --verbose"
runTest $name $test_args "$want"
