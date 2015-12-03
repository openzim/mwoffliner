#!/bin/sh

ZIM2INDEX=/srv/upload/zim2index/
SCRIPT=`readlink -f $0/../`
SCRIPT_DIR=`dirname "$SCRIPT"`
MWOFFLINER="$SCRIPT_DIR/mwoffliner.js --verbose --skipCacheCleaning --adminEmail=kelson@kiwix.org --format= --format=nopic"
MWMATRIXOFFLINER="$SCRIPT_DIR/mwmatrixoffliner.js --speed=5 --verbose --adminEmail=contact@kiwix.org --mwUrl=https://meta.wikimedia.org/ --skipCacheCleaning"

# Vikidia
$MWOFFLINER --speed=1 --mwUrl=https://fr.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://es.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://eu.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://it.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://en.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://ca.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://ru.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&
$MWOFFLINER --speed=1 --mwUrl=https://scn.vikidia.org/ --outputDirectory=$ZIM2INDEX/vikidia/ &&

# Wikipedia medicine
/srv/kiwix-tools/tools/scripts/listCategoryEntries.pl --host=en.wikipedia.org --category="WikiProject_Medicine_articles" --category="WikiProject_Anatomy_articles" --category="WikiProject_Pharmacology_articles" --path=w --exploration=5 --namespace=1 | sed 's/Talk://' | sort -u > "$SCRIPT_DIR/medicine" &&
echo "Wikipedia:WikiProject_Medicine/Open_Textbook_of_Medicine" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Cardiology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Dermatology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Ears_nose_throat" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Endocrinology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Gastroenterology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:General_surgery" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Infectious_disease" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Medications" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Cancer" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Ophthalmology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Pediatrics" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Psychiatry" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Rheumatology" >> "$SCRIPT_DIR/medicine" &&
echo "Book:Women's_health" >> "$SCRIPT_DIR/medicine" &&
wget "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Wiki_Project_Med_Foundation_logo.svg/335px-Wiki_Project_Med_Foundation_logo.svg.png" -O "$SCRIPT_DIR/medicine.png" &&
$MWOFFLINER --speed=5 --mwUrl="https://en.wikipedia.org/" --parsoidUrl="http://rest.wikimedia.org/en.wikipedia.org/v1/page/html/" --customZimTitle="WikiMed Medical Encyclopedia" --customZimDescription="The Wikipedia Medical Encyclopedia" --customMainPage="Wikipedia:WikiProject_Medicine/Open_Textbook_of_Medicine" --customZimFavicon="$SCRIPT_DIR/medicine.png" --articleList="$SCRIPT_DIR/medicine" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia in Hebrew
$MWOFFLINER --speed=5 --mwUrl="https://he.wikipedia.org/" --parsoidUrl="http://rest.wikimedia.org/he.wikipedia.org/v1/page/html/" --customMainPage="ויקיפדיה:עמוד_ראשי/לא-מקוון" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikivoyage in english
$MWOFFLINER --speed=5 --mwUrl="https://en.wikivoyage.org/" --parsoidUrl="http://rest.wikimedia.org/en.wikivoyage.org/v1/page/html/" --customMainPage="Wikivoyage:Offline_reader_Expedition/Home_page" --outputDirectory=$ZIM2INDEX/wikivoyage/ &&

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language='(en|fr)'
