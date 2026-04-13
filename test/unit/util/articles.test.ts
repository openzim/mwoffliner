import { isSubpage, isMainPage, getNamespaceName, extractBodyCssClass, extractHtmlCssClass, extractJsConfigVars } from '../../../src/util/articles.js'
import MediaWiki from '../../../src/MediaWiki.js'

describe('articles utility', () => {
  const fakeHeadHtml = [
    [
      '1.31.10',
      `<!DOCTYPE html>\n<html class="client-nojs" lang="en" dir="ltr">\n<head>\n<meta charset="UTF-8"/>\n<title> - Official TF2 Wiki | Official Team Fortress Wiki</title>\n<script>document.documentElement.className = document.documentElement.className.replace( /(^|\\s)client-nojs(\\s|$)/, "$1client-js$2" );</script>\n<script>(window.RLQ=window.RLQ||[]).push(function(){mw.config.set({"wgCanonicalNamespace":"","wgCanonicalSpecialPageName":false,"wgNamespaceNumber":0,"wgPageName":"Main_Page","wgTitle":"Main Page","wgCurRevisionId":3953283,"wgRevisionId":0,"wgArticleId":137697,"wgIsArticle":false,"wgIsRedirect":false,"wgAction":"nosuchaction","wgUserName":null,"wgUserGroups":["*"],"wgCategories":["Pages using duplicate arguments in template calls","Main","Main Page"],"wgBreakFrames":true,"wgPageContentLanguage":"en","wgPageContentModel":"wikitext","wgSeparatorTransformTable":["",""],"wgDigitTransformTable":["",""],"wgDefaultDateFormat":"dmy","wgMonthNames":["","January","February","March","April","May","June","July","August","September","October","November","December"],"wgMonthNamesShort":["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],"wgRelevantPageName":"Main_Page","wgRelevantArticleId":137697,"wgRequestId":"39ea213d25d9a7e409c2cca1","wgIsProbablyEditable":false,"wgRelevantPageIsProbablyEditable":false,"wgRestrictionEdit":["sysop"],"wgRestrictionMove":["sysop"],"wgIsMainPage":true,"wgCategoryTreePageCategoryOptions":"{\\"mode\\":0,\\"hideprefix\\":20,\\"showcount\\":true,\\"namespaces\\":false}","wgWikiEditorEnabledModules":[],"wgMediaViewerOnClick":true,"wgMediaViewerEnabledByDefault":true});mw.loader.state({"site.styles":"ready","noscript":"ready","user.styles":"ready","user":"ready","user.options":"ready","user.tokens":"loading","mediawiki.legacy.shared":"ready","mediawiki.legacy.commonPrint":"ready","mediawiki.sectionAnchor":"ready","mediawiki.skinning.interface":"ready","skins.vector.styles":"ready"});mw.loader.implement("user.tokens@1wcxb6f",function($,jQuery,require,module){/*@nomin*/mw.user.tokens.set({"editToken":"+\\\\","patrolToken":"+\\\\","watchToken":"+\\\\","csrfToken":"+\\\\"});\n});mw.loader.load(["site","mediawiki.page.startup","mediawiki.user","mediawiki.hidpi","mediawiki.page.ready","mediawiki.searchSuggest"]);});</script>\n<link rel="stylesheet" href="/w/load.php?debug=false&amp;lang=en&amp;modules=mediawiki.legacy.commonPrint%2Cshared%7Cmediawiki.sectionAnchor%7Cmediawiki.skinning.interface%7Cskins.vector.styles&amp;only=styles&amp;skin=vector"/>\n<script async="" src="/w/load.php?debug=false&amp;lang=en&amp;modules=startup&amp;only=scripts&amp;skin=vector"></script>\n<meta name="ResourceLoaderDynamicStyles" content=""/>\n<link rel="stylesheet" href="/w/load.php?debug=false&amp;lang=en&amp;modules=site.styles&amp;only=styles&amp;skin=vector"/>\n<meta name="generator" content="MediaWiki 1.31.10"/>\n<link rel="apple-touch-icon" href="http://wiki.teamfortress.com/w/images/2/21/IOS_Bookmark_Wiki_Logo.png"/>\n<link rel="shortcut icon" href="/favicon.ico"/>\n<link rel="search" type="application/opensearchdescription+xml" href="/w/opensearch_desc.php" title="Team Fortress Wiki (en)"/>\n<link rel="EditURI" type="application/rsd+xml" href="https://wiki.teamfortress.com/w/api.php?action=rsd"/>\n<link rel="alternate" type="application/atom+xml" title="Team Fortress Wiki Atom feed" href="/w/index.php?title=Special:RecentChanges&amp;feed=atom"/>\n<link rel="canonical" href="https://wiki.teamfortress.com/wiki/Main_Page"/>\n<!--[if lt IE 9]><script src="/w/load.php?debug=false&amp;lang=en&amp;modules=html5shiv&amp;only=scripts&amp;skin=vector&amp;sync=1"></script><![endif]-->\n</head>\n<body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Main_Page rootpage-Main_Page skin-vector action-nosuchaction">`,
    ],
    [
      '1.35.11',
      `<!DOCTYPE html>\n<html class="client-nojs" lang="en" dir="ltr">\n<head>\n<meta charset="UTF-8"/>\n<title> - Dwarf Fortress Wiki</title>\n<script>document.documentElement.className="client-js";RLCONF={"wgBreakFrames":!0,"wgSeparatorTransformTable":["",""],"wgDigitTransformTable":["",""],"wgDefaultDateFormat":"dmy","wgMonthNames":["","January","February","March","April","May","June","July","August","September","October","November","December"],"wgRequestId":"a2d0130ee3ef8d3739ddb745","wgCSPNonce":!1,"wgCanonicalNamespace":"","wgCanonicalSpecialPageName":!1,"wgNamespaceNumber":0,"wgPageName":"Dwarf_Fortress","wgTitle":"Dwarf Fortress","wgCurRevisionId":310678,"wgRevisionId":0,"wgArticleId":1858,"wgIsArticle":!1,"wgIsRedirect":!1,"wgAction":"nosuchaction","wgUserName":null,"wgUserGroups":["*"],"wgCategories":["Unversioned","Game"],"wgPageContentLanguage":"en","wgPageContentModel":"wikitext","wgRelevantPageName":"Dwarf_Fortress","wgRelevantArticleId":1858,"wgIsProbablyEditable":!0,"wgRelevantPageIsProbablyEditable":!0,"wgRestrictionEdit":[],"wgRestrictionMove":[]};RLSTATE={"site.styles":"ready","noscript":"ready",\n"user.styles":"ready","user":"ready","user.options":"loading","skins.vector.styles.legacy":"ready","mediawiki.toc.styles":"ready"};RLPAGEMODULES=["site","mediawiki.page.startup","mediawiki.page.ready","mediawiki.toc","skins.vector.legacy.js"];</script>\n<script>(RLQ=window.RLQ||[]).push(function(){mw.loader.implement("user.options@1hzgi",function($,jQuery,require,module){/*@nomin*/mw.user.tokens.set({"patrolToken":"+\\\\","watchToken":"+\\\\","csrfToken":"+\\\\"});\n});});</script>\n<link rel="stylesheet" href="/load.php?lang=en&amp;modules=mediawiki.toc.styles%7Cskins.vector.styles.legacy&amp;only=styles&amp;skin=vector"/>\n<script async="" src="/load.php?lang=en&amp;modules=startup&amp;only=scripts&amp;raw=1&amp;skin=vector"></script>\n<meta name="ResourceLoaderDynamicStyles" content=""/>\n<link rel="stylesheet" href="/load.php?lang=en&amp;modules=site.styles&amp;only=styles&amp;skin=vector"/>\n<meta name="generator" content="MediaWiki 1.35.11"/>\n<link rel="alternate" type="application/x-wiki" title="Edit" href="/index.php?title=Dwarf_Fortress&amp;action=edit"/>\n<link rel="edit" title="Edit" href="/index.php?title=Dwarf_Fortress&amp;action=edit"/>\n<link rel="shortcut icon" href="/favicon.ico"/>\n<link rel="search" type="application/opensearchdescription+xml" href="/opensearch_desc.php" title="Dwarf Fortress Wiki (en)"/>\n<link rel="EditURI" type="application/rsd+xml" href="//dwarffortresswiki.org/api.php?action=rsd"/>\n<link rel="license" href="/index.php/Dwarf_Fortress_Wiki:Copyrights"/>\n<link rel="alternate" type="application/atom+xml" title="Dwarf Fortress Wiki Atom feed" href="/index.php?title=Special:RecentChanges&amp;feed=atom"/>\n<!--[if lt IE 9]><script src="/resources/lib/html5shiv/html5shiv.js"></script><![endif]-->\n</head>\n<body class="mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject mw-editable page-Dwarf_Fortress rootpage-Dwarf_Fortress skin-vector action-nosuchaction skin-vector-legacy minerva--history-page-action-enabled">`,
    ],
    [
      '1.45.0',
      `<!DOCTYPE html>\n<html class="client-nojs vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-1 vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-1 skin-theme-clientpref-day vector-sticky-header-enabled" lang="hu" dir="ltr">\n<head>\n<meta charset="UTF-8">\n<title> – Wikipédia</title>\n<script>(function(){var className="client-js vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-1 vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-1 vector-feature-night-mode-disabled skin-theme-clientpref-day vector-sticky-header-enabled";var cookie=document.cookie.match(/(?:^|; )huwikimwclientpreferences=([^;]+)/);if(cookie){cookie[1].split('%2C').forEach(function(pref){className=className.replace(new RegExp('(^| )'+pref.replace(/-clientpref-\\w+$|[^\\w-]+/g,'')+'-clientpref-\\\\w+( |$)'),'$1'+pref+'$2');});}document.documentElement.className=className;}());RLCONF={"wgBreakFrames":true,"wgSeparatorTransformTable":[",\\t."," \\t,"],"wgDigitTransformTable":["",""],"wgDefaultDateFormat":"ymd","wgMonthNames":["","január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"],"wgRequestId":"0885a2d2-9450-4674-a4ed-1c624a117550","wgCanonicalNamespace":"","wgCanonicalSpecialPageName":false,"wgNamespaceNumber":0,"wgPageName":"Brian_May","wgTitle":"Brian May","wgCurRevisionId":28075618,"wgRevisionId":0,"wgArticleId":19638,"wgIsArticle":true,"wgIsRedirect":false,"wgAction":"view","wgUserName":null,"wgUserGroups":["*"],"wgCategories":["Mágikus ISBN-linkeket használó lapok","Wikipédia-szócikkek VIAF-azonosítóval","Wikipédia-szócikkek LCCN-azonosítóval","Wikipédia-szócikkek ISNI-azonosítóval","Wikipédia-szócikkek ORCID-azonosítóval","Wikipédia-szócikkek GND-azonosítóval","Wikipédia-szócikkek BNF-azonosítóval","Wikipédia-szócikkek SBN-azonosítóval","Wikipédia-szócikkek KKT-azonosítóval","Wikipédia-szócikkek BIBSYS-azonosítóval","1947-ben született személyek","Londoniak","Élő személyek","Queen","Brit rockgitárosok","Brit zeneszerzők","A Brit Birodalom Rendjével kitüntetett személyek","Minden idők 100 legjobb gitárosa (Rolling Stone magazin)"],"wgPageViewLanguage":"hu","wgPageContentLanguage":"hu","wgPageContentModel":"wikitext","wgRelevantPageName":"Brian_May","wgRelevantArticleId":19638,"wgIsProbablyEditable":true,"wgRelevantPageIsProbablyEditable":true,"wgRestrictionEdit":[],"wgRestrictionMove":[],"wgNoticeProject":"wikipedia","wgCiteReferencePreviewsActive":true,"wgFlaggedRevsParams":{"tags":{"accuracy":{"levels":2}}},"wgStableRevisionId":28075618,"wgMediaViewerOnClick":true,"wgMediaViewerEnabledByDefault":true,"wgPopupsFlags":0,"wgVisualEditor":{"pageLanguageCode":"hu","pageLanguageDir":"ltr","pageVariantFallbacks":"hu"},"wgMFDisplayWikibaseDescriptions":{"search":true,"watchlist":true,"tagline":true,"nearby":true},\n"wgWMESchemaEditAttemptStepOversample":false,"wgWMEPageLength":70000,"parsermigration-parsoid":true};\nRLSTATE={"site.styles":"ready","user.styles":"ready","user":"ready","user.options":"loading","skins.vector.search.codex.styles":"ready","skins.vector.styles":"ready","skins.vector.icons":"ready","ext.cite.parsoid.styles":"ready","ext.cite.styles":"ready","ext.tmh.player.styles":"ready","mediawiki.skinning.content.parsoid":"ready"};RLPAGEMODULES=["site","mediawiki.page.ready","skins.vector.js","ext.cite.ux-enhancements","mediawiki.page.media","ext.tmh.player"];</script>\n<script>(RLQ=window.RLQ||[]).push(function(){mw.loader.impl(function(){return["user.options@12s5i",function($,jQuery,require,module){mw.user.tokens.set({"patrolToken":"+\\\\","watchToken":"+\\\\","csrfToken":"+\\\\"});\n}];});});</script>\n<link rel="stylesheet" href="/w/load.php?lang=hu&amp;modules=ext.cite.parsoid.styles%7Cext.cite.styles%7Cext.tmh.player.styles%7Cmediawiki.skinning.content.parsoid%7Cskins.vector.icons%2Cstyles%7Cskins.vector.search.codex.styles&amp;only=styles&amp;skin=vector-2022">\n<script async="" src="/w/load.php?lang=hu&amp;modules=startup&amp;only=scripts&amp;raw=1&amp;skin=vector-2022"></script>\n<meta name="ResourceLoaderDynamicStyles" content="">\n<link rel="stylesheet" href="/w/load.php?lang=hu&amp;modules=site.styles&amp;only=styles&amp;skin=vector-2022">\n<meta name="generator" content="MediaWiki 1.45.0-wmf.7">\n<meta name="referrer" content="origin">\n<meta name="referrer" content="origin-when-cross-origin">\n<meta name="robots" content="max-image-preview:standard">\n<meta name="format-detection" content="telephone=no">\n<link rel="preconnect" href="//upload.wikimedia.org">\n<link rel="alternate" type="application/x-wiki" title="Szerkesztés" href="/w/index.php?title=Brian_May&amp;action=edit">\n<link rel="apple-touch-icon" href="/static/apple-touch/wikipedia.png">\n<link rel="icon" href="/static/favicon/wikipedia.ico">\n<link rel="search" type="application/opensearchdescription+xml" href="/w/rest.php/v1/search" title="Wikipédia (hu)">\n<link rel="EditURI" type="application/rsd+xml" href="//hu.wikipedia.org/w/api.php?action=rsd">\n<link rel="canonical" href="https://hu.wikipedia.org/wiki/Brian_May">\n<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/deed.hu">\n<link rel="alternate" type="application/atom+xml" title="Wikipédia Atom-hírcsatorna" href="/w/index.php?title=Speci%C3%A1lis:Friss_v%C3%A1ltoztat%C3%A1sok&amp;feed=atom">\n</head>\n<body class="skin--responsive skin-vector skin-vector-search-vue mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject mw-editable page-Brian_May rootpage-Brian_May skin-vector-2022 action-view">`,
    ],
  ]

  beforeAll(() => {
    MediaWiki.reset()
    MediaWiki.namespaces = {
      '': {
        num: 0,
        isContent: true,
        allowedSubpages: false,
      },
      Talk: {
        num: 1,
        isContent: false,
        allowedSubpages: true,
      },
      User: {
        num: 2,
        isContent: false,
        allowedSubpages: true,
      },
      Foo: {
        num: 100,
        isContent: true,
        allowedSubpages: true,
      },
    }
  })

  test.each(['Foo', 'Foo/Bar', 'Foo/Bar/Alix', 'Foo:Bar', 'Talk:Foo Bar', 'Talk:Foo_Bar'])('article is not subpage', (articleTitle) => {
    expect(isSubpage(articleTitle)).toBe(false)
  })

  test.each(['Foo:Bar/Alix', 'Talk:Foo/Bar', 'Talk:Foo/Bar Alix'])('article is a subpage', (articleTitle) => {
    expect(isSubpage(articleTitle)).toBe(true)
  })

  test.each(['Foo_Bar', 'Foo Bar'])('article is main page', (articleTitle) => {
    MediaWiki.metaData = { mainPage: 'Foo_Bar' }
    expect(isMainPage(articleTitle)).toBe(true)
  })

  test.each(['Foo:Bar/Alix', 'Talk:Foo/Bar', 'Talk:Foo/Bar Alix'])('article is not main page', (articleTitle) => {
    MediaWiki.metaData = { mainPage: 'Foo_Bar' }
    expect(isMainPage(articleTitle)).toBe(false)
  })

  test.each([
    [0, 'Foo'],
    [1, 'Bar'],
    [999, undefined],
  ])('getNamespaceName', (namespaceNumber, expectedNamespaceName) => {
    MediaWiki.namespaces = { Foo: { num: 0, allowedSubpages: false, isContent: true }, Bar: { num: 1, allowedSubpages: false, isContent: false } }
    expect(getNamespaceName(namespaceNumber)).toBe(expectedNamespaceName)
  })

  test.each(fakeHeadHtml)('extractBodyCssClass', (mwVersion, fakeHeadHtml) => {
    const result = {
      '1.31.10': 'mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Main_Page rootpage-Main_Page skin-vector action-view',
      '1.35.11':
        'mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Dwarf_Fortress rootpage-Dwarf_Fortress skin-vector action-view skin-vector-legacy minerva--history-page-action-enabled',
      '1.45.0':
        'skin--responsive skin-vector skin-vector-search-vue mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Brian_May rootpage-Brian_May skin-vector-2022 action-view',
    }
    expect(extractBodyCssClass(fakeHeadHtml).split(' ').sort()).toEqual(result[mwVersion].split(' ').sort())
  })

  test.each(fakeHeadHtml)('extractHtmlCssClass', (mwVersion, fakeHeadHtml) => {
    const result = {
      '1.31.10': 'client-nojs',
      '1.35.11': 'client-nojs',
      '1.45.0':
        'client-nojs vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-0 vector-toc-not-available vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-0 skin-theme-clientpref-os vector-sticky-header-enabled',
    }
    expect(extractHtmlCssClass(fakeHeadHtml).split(' ').sort()).toEqual(result[mwVersion].split(' ').sort())
  })

  test.each(fakeHeadHtml)('extractJsConfigVars', (mwVersion, fakeHeadHtml) => {
    const result = {
      '1.31.10': {
        wgCanonicalNamespace: '',
        wgCanonicalSpecialPageName: false,
        wgNamespaceNumber: 0,
        wgPageName: 'Main_Page',
        wgTitle: 'Main Page',
        wgCurRevisionId: 3953283,
        wgRevisionId: 0,
        wgArticleId: 137697,
        wgIsArticle: false,
        wgIsRedirect: false,
        wgAction: 'view',
        wgUserName: null,
        wgUserGroups: ['*'],
        wgCategories: ['Pages using duplicate arguments in template calls', 'Main', 'Main Page'],
        wgBreakFrames: false,
        wgPageContentLanguage: 'en',
        wgPageContentModel: 'wikitext',
        wgSeparatorTransformTable: ['', ''],
        wgDigitTransformTable: ['', ''],
        wgDefaultDateFormat: 'dmy',
        wgMonthNames: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        wgMonthNamesShort: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        wgRelevantPageName: 'Main_Page',
        wgRelevantArticleId: 137697,
        wgIsProbablyEditable: false,
        wgRelevantPageIsProbablyEditable: false,
        wgRestrictionEdit: ['sysop'],
        wgRestrictionMove: ['sysop'],
        wgIsMainPage: true,
        wgCategoryTreePageCategoryOptions: '{"mode":0,"hideprefix":20,"showcount":true,"namespaces":false}',
        wgWikiEditorEnabledModules: [],
        wgMediaViewerOnClick: true,
        wgMediaViewerEnabledByDefault: true,
      },
      '1.35.11': {
        wgBreakFrames: false,
        wgSeparatorTransformTable: ['', ''],
        wgDigitTransformTable: ['', ''],
        wgDefaultDateFormat: 'dmy',
        wgMonthNames: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        wgCSPNonce: false,
        wgCanonicalNamespace: '',
        wgCanonicalSpecialPageName: false,
        wgNamespaceNumber: 0,
        wgPageName: 'Dwarf_Fortress',
        wgTitle: 'Dwarf Fortress',
        wgCurRevisionId: 310678,
        wgRevisionId: 0,
        wgArticleId: 1858,
        wgIsArticle: false,
        wgIsRedirect: false,
        wgAction: 'view',
        wgUserName: null,
        wgUserGroups: ['*'],
        wgCategories: ['Unversioned', 'Game'],
        wgPageContentLanguage: 'en',
        wgPageContentModel: 'wikitext',
        wgRelevantPageName: 'Dwarf_Fortress',
        wgRelevantArticleId: 1858,
        wgIsProbablyEditable: false,
        wgRelevantPageIsProbablyEditable: false,
        wgRestrictionEdit: [],
        wgRestrictionMove: [],
      },
      '1.45.0': {
        wgBreakFrames: false,
        wgSeparatorTransformTable: [',\t.', ' \t,'],
        wgDigitTransformTable: ['', ''],
        wgDefaultDateFormat: 'ymd',
        wgMonthNames: ['', 'január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'],
        wgCanonicalNamespace: '',
        wgCanonicalSpecialPageName: false,
        wgNamespaceNumber: 0,
        wgPageName: 'Brian_May',
        wgTitle: 'Brian May',
        wgCurRevisionId: 28075618,
        wgRevisionId: 0,
        wgArticleId: 19638,
        wgIsArticle: true,
        wgIsRedirect: false,
        wgAction: 'view',
        wgUserName: null,
        wgUserGroups: ['*'],
        wgCategories: [
          'Mágikus ISBN-linkeket használó lapok',
          'Wikipédia-szócikkek VIAF-azonosítóval',
          'Wikipédia-szócikkek LCCN-azonosítóval',
          'Wikipédia-szócikkek ISNI-azonosítóval',
          'Wikipédia-szócikkek ORCID-azonosítóval',
          'Wikipédia-szócikkek GND-azonosítóval',
          'Wikipédia-szócikkek BNF-azonosítóval',
          'Wikipédia-szócikkek SBN-azonosítóval',
          'Wikipédia-szócikkek KKT-azonosítóval',
          'Wikipédia-szócikkek BIBSYS-azonosítóval',
          '1947-ben született személyek',
          'Londoniak',
          'Élő személyek',
          'Queen',
          'Brit rockgitárosok',
          'Brit zeneszerzők',
          'A Brit Birodalom Rendjével kitüntetett személyek',
          'Minden idők 100 legjobb gitárosa (Rolling Stone magazin)',
        ],
        wgPageViewLanguage: 'hu',
        wgPageContentLanguage: 'hu',
        wgPageContentModel: 'wikitext',
        wgRelevantPageName: 'Brian_May',
        wgRelevantArticleId: 19638,
        wgIsProbablyEditable: false,
        wgRelevantPageIsProbablyEditable: false,
        wgRestrictionEdit: [],
        wgRestrictionMove: [],
        wgNoticeProject: 'wikipedia',
        wgCiteReferencePreviewsActive: true,
        wgFlaggedRevsParams: { tags: { accuracy: { levels: 2 } } },
        wgStableRevisionId: 28075618,
        wgMediaViewerOnClick: true,
        wgMediaViewerEnabledByDefault: true,
        wgPopupsFlags: 0,
        wgVisualEditor: { pageLanguageCode: 'hu', pageLanguageDir: 'ltr', pageVariantFallbacks: 'hu' },
        wgMFDisplayWikibaseDescriptions: { search: true, watchlist: true, tagline: true, nearby: true },
        wgWMESchemaEditAttemptStepOversample: false,
        wgWMEPageLength: 70000,
        'parsermigration-parsoid': true,
      },
    }
    expect(extractJsConfigVars(fakeHeadHtml)).toEqual(result[mwVersion])
  })
})
