We have gathered here a few things which should be helpful if you want
to participate to MWoffliner development or hack it.

## Setup

To setup MWoffliner locally:
```bash
git clone https://github.com/openzim/mwoffliner.git
cd mwoffliner
npm ci
```

## Usage

To run it (this is only an example):
```bash
./node_modules/.bin/ts-node ./src/cli.ts --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

or

```bash
npm start -- --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

## Code

We use TypeScript for development. You can find all `.ts` files in
`src/**`.  The best way to develop is to run `npm run watch` in a
terminal, and then execute MWOffliner via the pre-configured debugger
in Visual Studio Code.  The compiled `.js` files are not committed to
Git, but they are published to NPM.

We follow a nearly exact `tslint:recommended` scheme -
you can see more information here: [./tslint.json](./tslint.json)

It's best to use TSLint to check your code as you develop, this
project is pre-configured for development with VSCode and the TSLint
plugin.

## Tests

To run the unit tests:
```bash
npm run test:unit # (or just npm test)
```

To run End-2-End tests:
```bash
npm run test:e2e
```

For S3 tests to pass, create a '.env' file (at the root of your
MWoffliner code directory) where you will configure the following
keys:
```
BASE_URL_TEST=...
KEY_ID_TEST=...
BUCKET_NAME_TEST=...
SECRET_ACCESS_KEY_TEST=...
```

## Debugging

There is a pre-configured debug config for
[VSCode](https://code.visualstudio.com/), just click on the debugging
tab.

Advices for debugging mwoffliner issues:

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
    processing a large wiki. In particular, the argument
    `--articleList` are useful.  Run mwoffliner with `--help` for
    details on those and other flags that may be useful.

## Publishing
To publish, it's best to use a clean clone of the project:
```bash
git clone https://github.com/openzim/mwoffliner.git
npm i
./dev/build.sh
npm publish  # you must be logged in already (npm login)
```

## Contributing Guidelines

First, please read the [contributing guidelines for our parent
project,
openZIM](https://github.com/openzim/overview/blob/master/CONTRIBUTING.md).
They cover the general process.
