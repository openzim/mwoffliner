# Contributing Guidelines

First, please read the
[contributing guidelines for our parent project, openZIM](https://github.com/openzim/overview/blob/master/CONTRIBUTING.md).
They cover the general process.

## TypeScript
We use TypeScript for development. You can find all `.ts` files in `src/**`.
The best way to develop is to run `npm run watch` in a terminal, and then execute MWOffliner via the pre-configured debugger in Visual Studio Code.
The compiled `.js` files are not committed to Git, but they are published to NPM.

## Background

Check the [Background section of README.md](README.md#background) for
some important concepts that motivate the advice below.

## Advice for debugging mwoffliner issues

1.  For pre-packaged Kiwix downloads, look at the scripts at
    https://github.com/kiwix/maintenance/tree/master/mwoffliner
    *   If both, then you may need separate corrections for each.
2.  Create Parsoid output to understand what mwoffliner is working
    with, including checking whether the error is with the Parsoid
    output itself.  For Wikimedia wikis you can easily generate and
    view the output in your browser using the Parsoid REST interface.
    Example URLs:
    *   Mobile (most pages):
        https://en.wikivoyage.org/api/rest_v1/page/mobile-sections/Hot_springs
    *   Desktop (main page):
        https://es.wikipedia.org/api/rest_v1/page/html/Espa%C3%B1a
3.  If the error is with the Parsoid output
    *   Mark the issue in openzim/mwoffliner with the
        "parsoid/mediawiki" tag.
    *   It's good to reach out to Parsoid to open a corresponding bug
        and reference it. Even so, keep the openzim/mwoffliner bug
        open until the Parsoid bug is fixed.
    *   Consider whether a workaround in mwoffliner is possible and
        worthwhile.
4.  Make a small test case to use as you develop rather than
    processing a large wiki. In particular, the arguments
    `--articleList` and `--format=nozim` are useful.  Run mwoffliner
    with `--help` for details on those and other flags that may be
    useful.
