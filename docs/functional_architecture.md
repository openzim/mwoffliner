# Functional Architecture

This document describes a high-level overview of how mwoffliner scraper works.

At a high level, mwoffliner is divided into following sequence of actions.

- retrieve Mediawiki info
- retrieve list of articles to include and their metadata
- for every article:
  - retrieve its parsed HTML (Wikitext transformed into HTML) and JS/CSS dependencie
  - adapt / render it for proper operation within the ZIM file (includes detection of media dependencies)
  - save rendered article HTML into the ZIM
- for every file dependency (JS/CSS/media)
  - if its an image, download it either from S3 cache (images only) or from online and recompress when possible
  - otherwise download it from online
  - save them into the ZIM file

The scraper supports flavours, which are variants of the ZIM (e.g. without images, with images but without videos, ...).

For now, retrieval of articles and files dependencies is repeated for every flavour requested (even if content probably didn't changed).

## Retrieve Mediawiki info

At scraper startup, it retrieves generic data about Mediawiki instance using `action=query` API.

Currently, scrape uses this call to retrieve:

- from `siteinfo`: `general` info (language, title, mainPage, site name, logo, text direction, ...), `skins` (to detect default skin), `rightsinfo` (to extract the license), `namespaces` and `namespacealiases` to build the list of namespcaes
- from `allmessages`: the `tagline` (subtitle)

## Retrive list of articles to include and their metadata

First, the scraper needs a list of article IDs and their details (redirects, ...).

If user specified the exact list of articles to retrieve, then scraper simply request details about every articles in the list, in batches of about 50 articles (with `action=query&titles=titleX|titleY|...` ; batch sizes may vary due to constraints on query parameters size).

Otherwise, the scraper enumerates articles in given namespaces (by default, all content namespaces) with the `allpages` generator, requesting one namespace content at a time (`action=query&generator=allpages&gapnamespace=xx`).

The details we retrieve at this stage about every articles are their title, subtitle, revisions, redirects, thumbnail, categories, coordinates (when it applies), text language, text direction and contentmodel (to consider only on wikitext ones).

## Retrieving article HTML and rendering

In order to retrieve article HTML and render it, multiple solutions have been identified.

As of today, 5 renderers (way to download article + render it to ZIM compatible HTML) are implemented:

- WikimediaDesktop
- WikimediaMobile
- RestApi
- VisualEditor
- ActionParse

WikimediaDesktop and WikimediaMobile are only available on Wikimedia Mediawikis.

Availability of RestApi and VisualEditor is subject to Mediawiki admin decision to support it or not. RestApi is available by default but might be blocked by admin. VisualEditor is an extension which might be installed or not.

ActionParse is available since 1.16.0 (2010) and is anyway a requirement for other APIs.

Only ActionParse (most recent renderer at mwoffliner level) implements a thorough skin support (see below about skin).

All renderers but ActionParse needs two HTTP queries: one to retrieve the article HTML and one to retrieve its metadata (to a 'simplified' ActionParse URL in fact).

The article metadata we retrieve at this stage is the article are:

- `displaytitle` and `subtitle`
- `headhtml`: used to extract proper CSS classes we have to set on `<html>` and `<body>` tags + some JS configuration variables which are part of the HTML head
- `jsconfigvars`: other JS configuration variables which comes from other parts of the Mediawiki codebase
- `modules`: list of JS and CSS modules to apply on current article

Renderer is automatically selected based on its availability and mwoffliner own preference. ActionParse is the preferred renderer since 1.15.0 due to its general availability and support of skins.

### ActionParse parser

When using ActionParse renderer, we pass `usearticle=1`, which means that we ask the Mediawiki to use the parser configured for this article. This allows the scraper to retrieve article `text` (inner of the HTML containing the article itself) that is as close as possible to what is used online, either Parsoid or legacy parser (see https://www.mediawiki.org/wiki/Parsoid). This is mandatory because if we use a parser different than the one used online, we will de-facto get bugs which are "normal", either because parser still has a bug, or an extension is not compatible, or because Wikitext contains some workaround understandable only by a given parser. This should be avoided at all price if we want to have a versatile scraper capable of processing any Mediawiki. Even focusing only on Wikimedia wikis, not all of them have already transitioned to Parsoid for instance.

### Skins

In Mediawikis, rendering of Wikitext into HTML works around a concept of skin. A skin is a mix of HTML template and CSS+JS dependencies. It defines both the visual appareance of the rendered Wikitext but also everything "around it".

Since most wikis have adapted their content to their skin (and vice versa), it is mostly mandatory to use the skin inside the ZIM, both for proper rendering and for a visual appareance similar to online website (users don't mind about technical details, they want the wiki to be the same inside the ZIM than online).

Skin detection is automated in mwoffliner for now (see https://github.com/openzim/mwoffliner/issues/2213).

For now, only `vector` (legacy) and `vector-2022` are supported, and only with ActionParse renderer. Only `vector-2022` is the truely responsive skin, providing ultimate rendering on mostly all screen sizes.

With ActionParse renderer, other skins have a `fallback` skin implemented in the scraper. This means that the scraper will render the article HTML inside an HTML structure which looks like an expected structure (which comes from `vector` legacy). The consequence is that if the skins uses only article HTML structure to attach CSS rules or JS code, then everything will render fine. If the skins uses HTML structures coming from the "surrounding HTML" (headers, ...) then things will not apply 100% correctly.

### JS / CSS dependencies

ActionParse API is returning the list of JS and CSS dependencies for a given article, by inspecting what Wikitext is using.

The special `startup` JS module is missing from results because always used anyway.

There are still some known hiccups around this (see https://github.com/openzim/mwoffliner/issues/2212 and https://github.com/openzim/mwoffliner/issues/2215 for instance), and probably more to come, this is a complex area of Mediawiki.
