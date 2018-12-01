# Contributing Guidelines

First, please read the
[contributing guidelines for our parent project, openZIM](https://github.com/openzim/overview/blob/master/CONTRIBUTING.md).
They cover the general process.

## Background

Check the [Background section of README.md](README.md#background) for
some important concepts that motivate the advice below.

## Advice for debugging mwoffliner issues

1.  For pre-packaged Kiwix downloads, look at the scripts at
    https://github.com/kiwix/maintenance/tree/master/mwoffliner
    *   If both, then you may need separate corrections for each.
1.  Create Parsoid output to understand what mwoffliner is working
    with, including checking whether the error is with the Parsoid
    output itself.  For Wikimedia wikis you can easily generate and
    view the output in your browser using the Parsoid REST interface.
    Example URLs:
    *   Mobile (most pages):
        https://en.wikivoyage.org/api/rest_v1/page/mobile-sections/Hot_springs
    *   Desktop (main page):
        https://es.wikipedia.org/api/rest_v1/page/html/Espa%C3%B1a
2.  If the error is with the Parsoid output
    *   Mark the issue in openzim/mwoffliner with the
        "parsoid/mediawiki" tag.
    *   It's good to reach out to Parsoid to open a corresponding bug
        and reference it. Even so, keep the openzim/mwoffliner bug
        open until the Parsoid bug is fixed.
    *   Consider whether a workaround in mwoffliner is possible and
        worthwhile.
3.  Make a small test case to use as you develop rather than
    processing a large wiki. In particular, the arguments
    `--articleList` and `--format=nozim` are useful.  Run mwoffliner
    with `--help` for details on those and other flags that may be
    useful.
