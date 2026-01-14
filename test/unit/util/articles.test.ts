import { isSubpage, isMainPage, getNamespaceName, extractBodyCssClass, extractHtmlCssClass } from '../../../src/util/articles.js'
import MediaWiki from '../../../src/MediaWiki.js'

describe('articles utility', () => {
  const fakeHeadHtml = `<!DOCTYPE html>\n<html class="client-nojs vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-1 vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-1 skin-theme-clientpref-day vector-sticky-header-enabled" lang="hu" dir="ltr">\n<head>\n<meta charset="UTF-8">\n<title> – Wikipédia</title>\n<script>(function(){var className="client-js vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-1 vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-1 vector-feature-night-mode-disabled skin-theme-clientpref-day vector-sticky-header-enabled";var cookie=document.cookie.match(/(?:^|; )huwikimwclientpreferences=([^;]+)/);if(cookie){cookie[1].split('%2C').forEach(function(pref){className=className.replace(new RegExp('(^| )'+pref.replace(/-clientpref-\\w+$|[^\\w-]+/g,'')+'-clientpref-\\\\w+( |$)'),'$1'+pref+'$2');});}document.documentElement.className=className;}());RLCONF={"wgBreakFrames":true,"wgSeparatorTransformTable":[",\\t."," \\t,"],"wgDigitTransformTable":["",""],"wgDefaultDateFormat":"ymd","wgMonthNames":["","január","február","március","április","május","június","július","augusztus","szeptember","október","november","december"],"wgRequestId":"0885a2d2-9450-4674-a4ed-1c624a117550","wgCanonicalNamespace":"","wgCanonicalSpecialPageName":false,"wgNamespaceNumber":0,"wgPageName":"Brian_May","wgTitle":"Brian May","wgCurRevisionId":28075618,"wgRevisionId":0,"wgArticleId":19638,"wgIsArticle":true,"wgIsRedirect":false,"wgAction":"view","wgUserName":null,"wgUserGroups":["*"],"wgCategories":["Mágikus ISBN-linkeket használó lapok","Wikipédia-szócikkek VIAF-azonosítóval","Wikipédia-szócikkek LCCN-azonosítóval","Wikipédia-szócikkek ISNI-azonosítóval","Wikipédia-szócikkek ORCID-azonosítóval","Wikipédia-szócikkek GND-azonosítóval","Wikipédia-szócikkek BNF-azonosítóval","Wikipédia-szócikkek SBN-azonosítóval","Wikipédia-szócikkek KKT-azonosítóval","Wikipédia-szócikkek BIBSYS-azonosítóval","1947-ben született személyek","Londoniak","Élő személyek","Queen","Brit rockgitárosok","Brit zeneszerzők","A Brit Birodalom Rendjével kitüntetett személyek","Minden idők 100 legjobb gitárosa (Rolling Stone magazin)"],"wgPageViewLanguage":"hu","wgPageContentLanguage":"hu","wgPageContentModel":"wikitext","wgRelevantPageName":"Brian_May","wgRelevantArticleId":19638,"wgIsProbablyEditable":true,"wgRelevantPageIsProbablyEditable":true,"wgRestrictionEdit":[],"wgRestrictionMove":[],"wgNoticeProject":"wikipedia","wgCiteReferencePreviewsActive":true,"wgFlaggedRevsParams":{"tags":{"accuracy":{"levels":2}}},"wgStableRevisionId":28075618,"wgMediaViewerOnClick":true,"wgMediaViewerEnabledByDefault":true,"wgPopupsFlags":0,"wgVisualEditor":{"pageLanguageCode":"hu","pageLanguageDir":"ltr","pageVariantFallbacks":"hu"},"wgMFDisplayWikibaseDescriptions":{"search":true,"watchlist":true,"tagline":true,"nearby":true},"wgWMESchemaEditAttemptStepOversample":false,"wgWMEPageLength":70000,"parsermigration-parsoid":true};\nRLSTATE={"site.styles":"ready","user.styles":"ready","user":"ready","user.options":"loading","skins.vector.search.codex.styles":"ready","skins.vector.styles":"ready","skins.vector.icons":"ready","ext.cite.parsoid.styles":"ready","ext.cite.styles":"ready","ext.tmh.player.styles":"ready","mediawiki.skinning.content.parsoid":"ready"};RLPAGEMODULES=["site","mediawiki.page.ready","skins.vector.js","ext.cite.ux-enhancements","mediawiki.page.media","ext.tmh.player"];</script>\n<script>(RLQ=window.RLQ||[]).push(function(){mw.loader.impl(function(){return["user.options@12s5i",function($,jQuery,require,module){mw.user.tokens.set({"patrolToken":"+\\\\","watchToken":"+\\\\","csrfToken":"+\\\\"});\n}];});});</script>\n<link rel="stylesheet" href="/w/load.php?lang=hu&amp;modules=ext.cite.parsoid.styles%7Cext.cite.styles%7Cext.tmh.player.styles%7Cmediawiki.skinning.content.parsoid%7Cskins.vector.icons%2Cstyles%7Cskins.vector.search.codex.styles&amp;only=styles&amp;skin=vector-2022">\n<script async="" src="/w/load.php?lang=hu&amp;modules=startup&amp;only=scripts&amp;raw=1&amp;skin=vector-2022"></script>\n<meta name="ResourceLoaderDynamicStyles" content="">\n<link rel="stylesheet" href="/w/load.php?lang=hu&amp;modules=site.styles&amp;only=styles&amp;skin=vector-2022">\n<meta name="generator" content="MediaWiki 1.45.0-wmf.7">\n<meta name="referrer" content="origin">\n<meta name="referrer" content="origin-when-cross-origin">\n<meta name="robots" content="max-image-preview:standard">\n<meta name="format-detection" content="telephone=no">\n<link rel="preconnect" href="//upload.wikimedia.org">\n<link rel="alternate" type="application/x-wiki" title="Szerkesztés" href="/w/index.php?title=Brian_May&amp;action=edit">\n<link rel="apple-touch-icon" href="/static/apple-touch/wikipedia.png">\n<link rel="icon" href="/static/favicon/wikipedia.ico">\n<link rel="search" type="application/opensearchdescription+xml" href="/w/rest.php/v1/search" title="Wikipédia (hu)">\n<link rel="EditURI" type="application/rsd+xml" href="//hu.wikipedia.org/w/api.php?action=rsd">\n<link rel="canonical" href="https://hu.wikipedia.org/wiki/Brian_May">\n<link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/deed.hu">\n<link rel="alternate" type="application/atom+xml" title="Wikipédia Atom-hírcsatorna" href="/w/index.php?title=Speci%C3%A1lis:Friss_v%C3%A1ltoztat%C3%A1sok&amp;feed=atom">\n</head>\n<body class="skin--responsive skin-vector skin-vector-search-vue mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject mw-editable page-Brian_May rootpage-Brian_May skin-vector-2022 action-view">`

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

  test('extractBodyCssClass', () => {
    expect(extractBodyCssClass(fakeHeadHtml).split(' ').sort()).toEqual(
      'skin--responsive skin-vector skin-vector-search-vue mediawiki ltr sitedir-ltr mw-hide-empty-elt ns-0 ns-subject page-Brian_May rootpage-Brian_May skin-vector-2022 action-view'
        .split(' ')
        .sort(),
    )
  })

  test('extractHtmlCssClass', () => {
    expect(extractHtmlCssClass(fakeHeadHtml).split(' ').sort()).toEqual(
      'client-nojs vector-feature-language-in-header-enabled vector-feature-language-in-main-page-header-disabled vector-feature-page-tools-pinned-disabled vector-feature-toc-pinned-clientpref-0 vector-toc-not-available vector-feature-main-menu-pinned-disabled vector-feature-limited-width-clientpref-1 vector-feature-limited-width-content-enabled vector-feature-custom-font-size-clientpref-1 vector-feature-appearance-pinned-clientpref-0 skin-theme-clientpref-os vector-sticky-header-enabled'
        .split(' ')
        .sort(),
    )
  })
})
