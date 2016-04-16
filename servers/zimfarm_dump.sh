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

# Wikipedia FR Tunisie
/srv/kiwix-tools/tools/scripts/listCategoryEntries.pl --host=fr.wikipedia.org --path=w --exploration=5 --namespace=1 --category="Évaluation_des_articles_sur_la_Tunisie" | sed 's/Discussion://' | sort -u > "$SCRIPT_DIR/tunisie" &&
echo "Portail:Tunisie/Index thématique" >> "$SCRIPT_DIR/tunisie" &&
wget "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Flag_of_Tunisia.svg/320px-Flag_of_Tunisia.svg.png" -O "$SCRIPT_DIR/tunisie.png" &&
$MWOFFLINER --speed=5 --mwUrl="https://fr.wikipedia.org/" --parsoidUrl="https://fr.wikipedia.org/api/rest_v1/page/html/" --customZimTitle="Encyclopédie de la Tunisie" --customZimDescription="Le meilleur de Wikipédia sur la Tunisie" --customMainPage="Portail:Tunisie/Index_thématique" --customZimFavicon="$SCRIPT_DIR/tunisie.png" --articleList="$SCRIPT_DIR/tunisie" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia ES Venezuela
wget "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Flag_of_Venezuela.svg/320px-Flag_of_Venezuela.svg.png" -O "$SCRIPT_DIR/venezuela.png" &&
$MWOFFLINER --speed=5 --mwUrl="https://es.wikipedia.org/" --parsoidUrl="https://es.wikipedia.org/api/rest_v1/page/html/" --customZimTitle="Enciclopedia de Venezuela" --customZimDescription="Selección de artículos de Wikipedia para Venezuela" --customMainPage="Wikipedia:Wikipedia_en_CD/Selección_de_artículos_para_Venezuela/Main" --customZimFavicon="$SCRIPT_DIR/venezuela.png" --articleList="$SCRIPT_DIR/selections/venezuela.lst" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia EN WP1 0.8
wget "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/WP1_0_Icon.svg/240px-WP1_0_Icon.svg.png" -O "$SCRIPT_DIR/wp1.png" &&
$MWOFFLINER --speed=5 --mwUrl="https://en.wikipedia.org/" --parsoidUrl="https://en.wikipedia.org/api/rest_v1/page/html/" --customZimTitle="Wikipedia 0.8" --customZimDescription="Wikipedia 45.000 best articles with pictures" --customMainPage="Wikipedia:Version_0.8" --customZimFavicon="$SCRIPT_DIR/wp1.png" --articleList="$SCRIPT_DIR/selections/wp1-0.8.lst" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia EN medicine
/srv/kiwix-tools/tools/scripts/listCategoryEntries.pl --host=en.wikipedia.org --category="WikiProject_Women's_health_articles" --category="WikiProject_Microbiology_articles" --category="WikiProject_Physiology_articles" --category="WikiProject_Medicine_articles" --category="WikiProject_Anatomy_articles" --category="WikiProject_Pharmacology_articles" --path=w --exploration=5 --namespace=1 | sed 's/Talk://' | sort -u > "$SCRIPT_DIR/medicine" &&
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
$MWOFFLINER --speed=5 --mwUrl="https://en.wikipedia.org/" --parsoidUrl="https://en.wikipedia.org/api/rest_v1/page/html/" --customZimTitle="WikiMed Medical Encyclopedia" --customZimDescription="The Wikipedia Medical Encyclopedia" --customMainPage="Wikipedia:WikiProject_Medicine/Open_Textbook_of_Medicine" --customZimFavicon="$SCRIPT_DIR/medicine.png" --articleList="$SCRIPT_DIR/medicine" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikipedia EN medicine langlinks
cat "$SCRIPT_DIR/medicine" | /srv/kiwix-tools/tools/scripts/listLangLinks.pl --host=en.wikipedia.org --path=w --readFromStdin --language=as --language=bn --language=gu --language=hi --language=kn --language=ml --language=bpy --language=mr --language=or --language=pa --language=ta --language=te --language=ur > "$SCRIPT_DIR/medicine.langlinks"

# Wikipedia in Hebrew
$MWOFFLINER --speed=5 --mwUrl="https://he.wikipedia.org/" --parsoidUrl="https://he.wikipedia.org/api/rest_v1/page/html/" --customMainPage="ויקיפדיה:עמוד_ראשי/לא-מקוון" --outputDirectory=$ZIM2INDEX/wikipedia/ &&

# Wikivoyage in english
$MWOFFLINER --speed=5 --mwUrl="https://en.wikivoyage.org/" --parsoidUrl="https://en.wikivoyage.org/api/rest_v1/page/html/" --customMainPage="Wikivoyage:Offline_reader_Expedition/Home_page" --outputDirectory=$ZIM2INDEX/wikivoyage/ &&

# Wikipedia
$MWMATRIXOFFLINER --project=wiki --outputDirectory=$ZIM2INDEX/wikipedia/ --language='(en|fr)'
