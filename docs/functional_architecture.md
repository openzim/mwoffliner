# Functional Architecture

This document describes a high-level overview of how mwoffliner scraper works.

At a high level, mwoffliner is divided into following sequence of actions.

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

The process above is repeated for every flavour requested.

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

Only ActionParse (most recent renderer) implements a thorough skin support (see below about skin).

All renderers but ActionParse needs two HTTP queries: one to retrieve the article HTML and one to retrieve its metadata (to a 'simplified' ActionParse URL in fact).

Renderer is automatically selected based on its availability and mwoffliner own preference. ActionParse is the preferred renderer since 1.15.0 due to its general availability and support of skins.

### Skins

In Mediwikis, rendering of Wikitext into HTML works around a concept of skin. A skin is a mix of HTML template and CSS+JS dependencies. It defines both the visual appareance of the rendered Wikitext but also everything "around it".

Since most wikis have adapted their content to their skin (and vice versa), it is mostly mandatory to use the skin inside the ZIM, both for proper rendering and for a visual appareance similar to online website (users don't mind about technical details, they want the wiki to be the same inside the ZIM than online).

Skin detection is automated in mwoffliner for now (see https://github.com/openzim/mwoffliner/issues/2213).

For now, only `vector` (legacy), `vector-2022` and `fandomdesktop` are supported, and only with ActionParse renderer. Only `vector-2022` is the truely responsive skin, providing ultimate rendering on mostly all screen sizes.


### JS / CSS dependencies

ActionParse API is returning the list of JS and CSS dependencies for a given article, by inspecting what Wikitext is using.

The special `startup` JS module is missing from results because always used anyway.

There are still some known hiccups around this (see https://github.com/openzim/mwoffliner/issues/2212 and https://github.com/openzim/mwoffliner/issues/2215 for instance), and probably more to come, this is a complex area of Mediawiki.
