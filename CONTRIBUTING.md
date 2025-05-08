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
./node_modules/.bin/ts-node-esm ./src/cli.ts --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

or

```bash
npm start -- --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

## Code

We use TypeScript for development. You can find all `.ts` files in
`src/**`. The best way to develop is to run `npm run watch` in a
terminal, and then execute MWOffliner via the pre-configured debugger
in Visual Studio Code. The compiled `.js` files are not committed to
Git, but they are published to NPM.

We follow a nearly exact `tslint:recommended` scheme -
you can see more information here: [./tslint.json](./tslint.json)

It's best to use TSLint to check your code as you develop, this
project is pre-configured for development with VSCode and the TSLint
plugin.

This repo also contains required pre-commit configuration, so that both
eslint and prettier are ran before any commit, as required by the CI.
Follow instructions at https://pre-commit.com/ to install it.

## Tests

To run the automated tests with collecting coverage (both unit and e2e):

```bash
npm test # or "npm run test"
```

To run the automated tests with collecting coverage and verbose all debug message (both unit and e2e):

```bash
npm run test-verbose
```

To run the automated tests without collecting coverage (both unit and e2e). This command will be a bit faster:

```bash
npm run test-without-coverage
```

To run the unit tests with collecting coverage:

```bash
npm run test:unit-coverage
```

To run the unit tests without collecting coverage:

```bash
npm run test:unit
```

To run end-2-end tests with collecting coverage:

```bash
npm run test:e2e-coverage
```

To run end-2-end tests without collecting coverage:

```bash
npm run test:e2e
```

To run a specfic test with collecting coverage:

```bash
npm run test:pattern test/e2e/wikisource.e2e.test.ts -- --coverage
```

To run a specfic test without collecting coverage:

```bash
npm run test:pattern test/e2e/wikisource.e2e.test.ts
```

To run a tests by regex pattern. Example which runs all e2e tests:

```bash
npm run test:pattern ^.*e2e.*\.test\.ts
```

For S3 tests to pass, create a '.env' file (at the root of your
MWoffliner code directory) where you will configure S3 URL
with credentials. Example:

```
S3_URL=https://s3.region.amazonaws.com/?bucketName=S3_BUCKET_NAME&keyId=S3_KEY_ID&secretAccessKey=S3_ACCESS_KEY
```

... or just ensure the `S3_URL` environment variable is properly set.

## Debugging

There is a pre-configured debug config for
[VSCode](https://code.visualstudio.com/), just click on the debugging
tab.

Advices for debugging mwoffliner issues:

1.  For pre-packaged Kiwix downloads, look at the scripts at
    https://github.com/kiwix/maintenance/tree/master/mwoffliner
    - If both, then you may need separate corrections for each.
2.  Create Parsoid output to understand what mwoffliner is working
    with, including checking whether the error is with the Parsoid
    output itself. For Wikimedia wikis you can easily generate and
    view the output in your browser using the Parsoid REST interface.
    Example URLs:
    - <del>Mobile (most pages):
      https://en.wikivoyage.org/api/rest_v1/page/mobile-sections/Hot_springs</del>
      > :warning: **DEPRECATED**: Mobile Content Service endpoints are now deprecated.
    - Desktop (main page):
      https://es.wikipedia.org/api/rest_v1/page/html/Espa%C3%B1a
3.  If the error is with the Parsoid output
    - Mark the issue in openzim/mwoffliner with the
      "parsoid/mediawiki" tag.
    - It's good to reach out to Parsoid to open a corresponding bug
      and reference it. Even so, keep the openzim/mwoffliner bug
      open until the Parsoid bug is fixed.
    - Consider whether a workaround in mwoffliner is possible and
      worthwhile.
4.  Make a small test case to use as you develop rather than
    processing a large wiki. In particular, the argument
    `--articleList` are useful. Run mwoffliner with `--help` for
    details on those and other flags that may be useful.

## Releasing and Publishing

To publish/release, it's best to use a clean clone of the project:

1. Clone `git clone https://github.com/openzim/mwoffliner.git`
2. Update `package.json`
3. Commit `:package: Release version vX.X.X`
4. Run `git tag vX.X.X`
5. Run `git push origin vX.X.X`
   Whenever a tag is pushed, the CI automatically publishes to npmjs.com

## Contributing Guidelines

First, please read the [contributing guidelines for our parent
project,
openZIM](https://github.com/openzim/overview/blob/master/CONTRIBUTING.md).
They cover the general process.
