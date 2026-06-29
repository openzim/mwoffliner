# Functional Architecture

This document describes a high-level overview of how mwoffliner scraper works.

At a high level, mwoffliner is divided into following sequence of actions.

- retrieve Mediawiki info
- retrieve list of pages to include and their metadata
- for every page:
  - retrieve its parsed HTML (Wikitext transformed into HTML) and JS/CSS dependencies
  - adapt / render it for proper operation within the ZIM file (includes detection of media dependencies)
  - save rendered page HTML into the ZIM
- for every file dependency (JS/CSS/media)
  - if its an image, download it either from S3 cache (images only) or from online and recompress when possible
  - otherwise download it from online
  - save them into the ZIM file

The scraper supports flavours, which are variants of the ZIM (e.g. without images, with images but without videos, ...).

For now, retrieval of pages and files dependencies is repeated for every flavour requested (even if content probably didn't changed).

## Lexicography

> [!NOTE]
> All these concepts have been clarified in mwoffliner 2.0.0.

- Page: Base object of Mediawikis. Could be an article. Since this scraper is capable to process non-main namespaces, it processes pages, not only articles (see [The_difference_between_articles_and_page](https://en.wikipedia.org/wiki/Wikipedia:The_difference_between_articles_and_pages)).
- Page Title : as in [Mediawiki](https://www.mediawiki.org/wiki/Manual:Page_title), title of the page with spaces (not underscores) but namespace. E.g. 'Escherichia coli O157:H7' or 'Category:Escherichia coli'.
- Page Display Title : as in [Mediawiki](https://www.mediawiki.org/wiki/Display_title), preferred title for display. May contain HTML code.
- Page ZIM Title : Title of the page in the ZIM

## Retrieve Mediawiki info

At scraper startup, it retrieves generic data about Mediawiki instance using `action=query` API.

Currently, scrape uses this call to retrieve:

- from `siteinfo`: `general` info (language, title, mainPage, site name, logo, text direction, ...), `skins` (to detect default skin), `rightsinfo` (to extract the license), `namespaces` and `namespacealiases` to build the list of namespaces
- from `allmessages`: the `tagline` (subtitle)

## Retrieve list of pages to include and their metadata

First, the scraper needs a list of page titles and their details (redirects, ...).

"Page title" refers to the page title with spaces (not underscores), even if it is possible to use underscores in many places since Mediawiki APIs + scraper are permissive when possible. It is not the numeric page ID.

If user specified the exact list of pages to retrieve, then scraper simply request details about every pages in the list, in batches of about 50 pages (with `action=query&titles=titleX|titleY|...` ; batch sizes may vary due to constraints on query parameters size).

Otherwise, the scraper enumerates pages in given namespaces (by default, all content namespaces) with the `allpages` generator, requesting one namespace content at a time (`action=query&generator=allpages&gapnamespace=xx`).

The details we retrieve at this stage about every pages are their title, subtitle, revisions, redirects, thumbnail, categories, coordinates (when it applies), text language, text direction and contentmodel (to consider only on wikitext ones).

## Retrieving page HTML and rendering

In order to retrieve page HTML and render it, multiple solutions have been identified.

As of today, 1 renderer (way to download page + render it to ZIM compatible HTML) is left implemented: ActionParse. Other renderers have been dropped in mwoffliner 2.0 because they were not used anymore, not implementing skin support and not providing added value compared to ActionParse render.

ActionParse API is available in Mediawiki since 1.16.0 (2010).

ActionParse renderer implements a thorough skin support (see below about skin) and needs only one HTTP query per page.

The page metadata we retrieve at this stage are:

- `displaytitle` and `subtitle`
- `headhtml`: used to extract proper CSS classes we have to set on `<html>` and `<body>` tags + some JS configuration variables which are part of the HTML head
- `jsconfigvars`: other JS configuration variables which comes from other parts of the Mediawiki codebase
- `modules`: list of JS and CSS modules to apply on current page

### ActionParse parser

When using ActionParse renderer, we pass `usearticle=1`, which means that we ask the Mediawiki to use the parser configured for this page. This allows the scraper to retrieve page `text` (inner of the HTML containing the page itself) that is as close as possible to what is used online, either Parsoid or legacy parser (see https://www.mediawiki.org/wiki/Parsoid). This is mandatory because if we use a parser different than the one used online, we will de-facto get bugs which are "normal", either because parser still has a bug, or an extension is not compatible, or because Wikitext contains some workaround understandable only by a given parser. This should be avoided at all price if we want to have a versatile scraper capable of processing any Mediawiki. Even focusing only on Wikimedia wikis, not all of them have already transitioned to Parsoid for instance.

### Skins

In Mediawikis, rendering of Wikitext into HTML works around a concept of skin. A skin is a mix of HTML template and CSS+JS dependencies. It defines both the visual appearance of the rendered Wikitext but also everything "around it".

Since most wikis have adapted their content to their skin (and vice versa), it is mostly mandatory to use the skin inside the ZIM, both for proper rendering and for a visual appearance similar to online website (users don't mind about technical details, they want the wiki to be the same inside the ZIM than online).

Skin detection is automated in mwoffliner for now (see https://github.com/openzim/mwoffliner/issues/2213).

For now, only `vector` (legacy) and `vector-2022` are supported, and only with ActionParse renderer. Only `vector-2022` is the truly responsive skin, providing ultimate rendering on mostly all screen sizes.

With ActionParse renderer, other skins have a `fallback` skin implemented in the scraper. This means that the scraper will render the page HTML inside an HTML structure which looks like an expected structure (which comes from `vector` legacy). The consequence is that if the skins uses only page HTML structure to attach CSS rules or JS code, then everything will render fine. If the skins uses HTML structures coming from the "surrounding HTML" (headers, ...) then things will not apply 100% correctly.

### JS / CSS dependencies

ActionParse API is returning the list of JS and CSS dependencies for a given page, by inspecting what Wikitext is using.

The special `startup` JS module is missing from results because always used anyway.

There are still some known hiccups around this (see https://github.com/openzim/mwoffliner/issues/2212 and https://github.com/openzim/mwoffliner/issues/2215 for instance), and probably more to come, this is a complex area of Mediawiki.
