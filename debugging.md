# Advice for debugging mwoffliner issues

1.  Check whether mwoffliner is using Desktop or Mobile mode or both.
    For pre-packaged Kiwix downloads, look at the scripts at
    https://github.com/kiwix/maintenance/tree/master/mwoffliner
    *   If both, then you may need separate corrections for each.
2.  Create Parsoid output to understand what mwoffliner is working
    with, including checking whether the error is with the Parsoid
    output itself.  For Wikimedia wikis you can easily generate and
    view the output in your browser using the Parsoid REST interface.
    Example URLs:
    *   Desktop:
        https://es.wikipedia.org/api/rest_v1/page/html/Espa%C3%B1a
    *   Mobile:
        https://en.wikivoyage.org/api/rest_v1/page/mobile-sections/Hot_springs
3.  Use the Parsoid output to understand how to correct mwoffliner.
4.  If the error is with the Parsoid output, then consider whether a
    workaround in mwoffliner is possible and worthwhile.
    *   Either way, mark the issue in openzim/mwoffliner with the
        "parsoid/mediawiki" tag.
    *   It's good to reach out to Parsoid to open a corresponding bug
        and reference it. Even so, keep the openzim/mwoffliner bug
        open until the Parsoid bug is fixed.

## Background/explanation

**There are two Wikitext parsers. mwoffliner uses Parsoid.**

*   Wikitext is the name of the markup language that Wikipedia uses.
*   MediaWiki is a PHP package that runs a wiki, including Wikipedia.
*   MediaWiki includes a parser for Wikitext into HTML, and this
    parser creates Wikipedia currently.
*   There is another Wikitext parser, called Parsoid, implemented in
    Javascript (Node.js).
*   Parsoid is planned to eventually become the main parser for
    Wikipedia.
*   Kiwix depends on Parsoid.
*   mwoffliner works by first calling Parsoid and then post-processing
    the results for offline format.

**mwoffliner code and behavior are radically different for Desktop and
Mobile modes.**

*   Parsoid output for Mobile is radically different than for Desktop
    *   Desktop: One renderable page
    *   Mobile: Multiple structured sections, but not directly renderable
*   Therefore mwoffliner is quite different depending on whether it is
    in Desktop or Mobile mode.
*   Some Kiwix downloads are only processed in one of Desktop or
    Mobile mode, so it's important to check which one is being used
    when you debug.  For example, wikitravel is only produced in
    Mobile mode (as of Sep 2018).
