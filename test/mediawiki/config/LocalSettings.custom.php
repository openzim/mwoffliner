<?php

# General
$wgSitename         = "My wiki";

# Site language 
$wgLanguageCode = "en";
$wgUploadWizardConfig['uwLanguages'] = array( 'en' => 'English' );

# Database settings
$wgDBtype        = "sqlite";
$wgDBserver      = "";
$wgDBname        = "my_wiki";
$wgDBuser        = "";
$wgDBpassword    = "";
$wgSQLiteDataDir = "/var/www/data";

# License
$wgRightsUrl = 'https://creativecommons.org/licenses/by-sa/4.0/';

wfLoadExtension( 'MobileFrontend' );
$wgMFAutodetectMobileView = true;

?>
