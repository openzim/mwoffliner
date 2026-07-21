# MWoffliner

MWoffliner is a tool for creating a local offline HTML snapshot of any online [MediaWiki](https://mediawiki.org) instance. It scrapes all pages (or a selection if specified) and creates the corresponding [ZIM](https://openzim.org) file. While primarily targeted for Wikimedia projects like [Wikipedia](https://wikipedia.org) and [Wiktionary](https://wiktionary.org), MWoffliner also supports any recent MediaWiki instance (version 1.27+), though instances with custom skins or highly unusual configurations may have limitations.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to learn more about MWoffliner development.

User help is available in the [FAQ](https://github.com/openzim/mwoffliner/wiki/Frequently-Asked-Questions).

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://www.npmjs.com/package/mwoffliner)

[![npm](https://img.shields.io/npm/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![node](https://img.shields.io/node/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![Docker](https://ghcr-badge.egpl.dev/openzim/mwoffliner/latest_tag?label=container)](https://ghcr.io/openzim/mwoffliner)
[![Build Status](https://github.com/openzim/mwoffliner/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/openzim/mwoffliner/actions/workflows/ci.yml?query=branch%3Amain)
[![codecov](https://codecov.io/gh/openzim/mwoffliner/branch/main/graph/badge.svg)](https://codecov.io/gh/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)
[![License](https://img.shields.io/npm/l/mwoffliner.svg)](LICENSE)
[![Join Slack](https://img.shields.io/badge/Join%20us%20on%20Slack%20%23mwoffliner-2EB67D)](https://slack.kiwix.org)

## Features

- Scrape with or without image thumbnails
- Scrape with or without audio/video multimedia content
- S3 cache (optional)
- Image size optimization and WebP conversion
- Scrape all pages in namespaces or title list based
- Specify additional/non-main namespaces to scrape

Run `mwoffliner --help` to see all available options.

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/) (or Docker-based engine)
- amd64 or arm64 architecture

## Installation

The recommended way to install and run `mwoffliner` is using the pre-built Docker container:

```sh
docker pull ghcr.io/openzim/mwoffliner
```

<details>
<summary>Run software locally / Build from source</summary>

### Prerequisites for local execution

- \*NIX Operating System (GNU/Linux, macOS, etc.)
- [Redis](https://redis.io/) — in-memory data store
- [Node.js](https://nodejs.org/en/) version 24 (we support only one single Node.js version; other versions might work or might not)
- [Libzim](https://github.com/openzim/libzim) — C++ library for creating ZIM files (automatically downloaded on GNU/Linux & macOS)
- Various build tools which are probably already installed on your machine:
  - `libjpeg-dev` — JPEG image processing
  - `libglu1` — OpenGL utility library
  - `autoconf` — automatic configuration system
  - `automake` — Makefile generator
  - `gcc` — C compiler

  (These packages are for Debian/Ubuntu systems)

An online [MediaWiki](https://mediawiki.org) instance with its API available.

### Installation methods

#### Build your own container

1. Clone the repository locally:

   ```sh
   git clone https://github.com/openzim/mwoffliner.git && cd mwoffliner
   ```

1. Build the image:

   ```sh
   docker build . -f docker/Dockerfile -t ghcr.io/openzim/mwoffliner
   ```

#### Run the software locally using NPM

> [!WARNING]
> Local installation requires several system dependencies (see above). Using the Docker image is strongly recommended to avoid setup issues.

Setting up MWoffliner locally for development can be tricky due to several dependencies and version requirements. Follow these steps carefully to avoid common errors.

##### 1. Node.js Version

MWoffliner requires Node.js 24 (other versions may fail).

Compatible Node 24 ranges: `>=24 <24.6` or `>=24.7 <25`.

Check your version:

```sh
node -v
```

If your version does not match, use [nvm](https://github.com/nvm-sh/nvm) to install the correct Node.js version.

##### 2. libzim Dependency

MWoffliner depends on [`@openzim/libzim`](https://github.com/openzim/libzim), which requires the C++ libzim library.

- On Linux/macOS, MWoffliner can download libzim automatically.
- On Windows, you must install libzim manually because there are no prebuilt binaries. See the [libzim installation guide](https://github.com/openzim/libzim) for details.

##### 3. Compiler Requirements (Windows)

Node 24 on Windows officially supports [Visual Studio 2019 (v16)](https://visualstudio.microsoft.com/vs/older-downloads/) or [Visual Studio 2022 (v17)](https://visualstudio.microsoft.com/downloads/).

Ensure C++ build tools are installed and environment variables are set correctly. See [Windows Setup for node-gyp](https://github.com/nodejs/node-gyp#on-windows) for detailed instructions.

##### 4. Node-gyp

MWoffliner uses [node-gyp](https://github.com/nodejs/node-gyp), which enforces strict checks for Node and compiler versions. Make sure you have:

- Proper Visual Studio version (Windows) — see [Visual Studio versions](https://visualstudio.microsoft.com/downloads/)
- Required C++ headers, e.g., `zim/archive.h` — see [libzim documentation](https://github.com/openzim/libzim)
- [Python 3.10+](https://www.python.org/downloads/) (required by node-gyp; a recent version is preferred for compatibility)

##### Additional troubleshooting steps if errors persist:

1. **Clear npm cache** — a corrupted cache can cause cryptic install failures:

   ```sh
   npm cache clean --force
   ```

2. **Delete node_modules and reinstall** — stale or partially installed dependencies are a common source of errors:

   ```sh
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check that all environment variables are set** — especially on Windows, `PATH`, `INCLUDE`, and `LIB` must point to the correct Visual Studio and libzim directories. Reopen your terminal after installing new tools.

4. **Verify Redis is running before starting MWoffliner** — MWoffliner will fail immediately if it cannot connect to Redis:

   ```sh
   redis-cli ping   # expected output: PONG
   ```

5. **Run npm install with verbose logging** to see exactly where it fails:
   ```sh
   npm install --verbose
   ```

##### 5. Common Errors & Troubleshooting

| Error                              | Cause                          | Solution                                                                                                                                                                 |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js version error              | Node.js version incompatible   | Install [Node 24 with nvm](https://github.com/nvm-sh/nvm)                                                                                                                |
| Cannot find module @openzim/libzim | libzim not installed           | Follow [libzim installation guide](https://github.com/openzim/libzim); Windows users must install manually                                                               |
| node-gyp rebuild failed            | Wrong Node or compiler version | Check [Node.js version](https://nodejs.org/en/), [Visual Studio version](https://visualstudio.microsoft.com/downloads/), [Python 3.x](https://www.python.org/downloads/) |
| zim/archive.h not found            | C++ headers missing            | Install [libzim](https://github.com/openzim/libzim) system-wide, verify include paths                                                                                    |

> [!NOTE]
> Even with these steps, other setup errors may occur. Using Docker is strongly recommended for a smoother experience.

##### Installation via NPM

```sh
npm i -g mwoffliner
```

> [!WARNING]
> You might need to run this command with the `sudo` command, depending on how your `npm` / OS is configured. `npm` permission checking can be a bit annoying for newcomers. Please read the [npm script documentation](https://docs.npmjs.com/cli/v7/using-npm/scripts#user) if you encounter issues.

</details>

## Usage

### Using Docker (Recommended)

```sh
# Get help
docker run -v $(pwd)/out:/out -ti ghcr.io/openzim/mwoffliner mwoffliner --help
```

```sh
# Create a ZIM for https://bm.wikipedia.org
docker run -v $(pwd)/out:/out -ti ghcr.io/openzim/mwoffliner \
       mwoffliner --mwUrl=https://bm.wikipedia.org --adminEmail=foo@bar.net
```

<details>
<summary>Using NPM / Local Install</summary>

```sh
# Get help
mwoffliner --help
```

```sh
# Create a ZIM for https://bm.wikipedia.org
mwoffliner --mwUrl=https://bm.wikipedia.org --adminEmail=foo@bar.net
```

</details>

To use MWoffliner with an S3 cache, provide an S3 URL:

```sh
--optimisationCacheUrl="https://wasabisys.com/?bucketName=my-bucket&keyId=my-key-id&secretAccessKey=my-sac"
```

## Contribute

If you've retrieved the MWoffliner source code (e.g., via a git clone), you can install and run it locally with your modifications:

```bash
npm i
npm run mwoffliner -- --help
```

Detailed [contribution documentation and guidelines](CONTRIBUTING.md) are available.

## API

MWoffliner provides an API and can be used as a Node.js library. Here's a stub example for your `index.mjs` file:

```javascript
import * as mwoffliner from 'mwoffliner'

const parameters = {
  mwUrl: 'https://es.wikipedia.org',
  adminEmail: 'foo@bar.net',
  verbose: true,
  format: 'nopic',
  pageList: './pageList',
}

mwoffliner.execute(parameters) // returns a Promise
```

## MathJax support

> [!WARNING]
> MathJax support is UNSTABLE: the `--mathJax*` CLI parameters described below may change, even in a minor release. Setting them up also requires wiki-specific technical preparation, so this is aimed at developers rather than end users.

MWoffliner can bundle [MathJax](https://www.mathjax.org) into the ZIM so that math formulas keep rendering offline, on wikis that rely on it (e.g. via the `SimpleMathJax` extension).

MathJax 2, 3 and 4 are very different beasts: each ships its own set of files and, more importantly, each requires its own incompatible configuration format (which defines things like math delimiters and custom macros). Because of this, MWoffliner cannot auto-detect and configure MathJax for you — you have to supply a matching MathJax build and configuration yourself, via three CLI parameters:

- `--mathJaxSource`: local path or HTTP(S) URL to a ZIP archive of a compiled MathJax distribution. Its content is extracted and pushed to the ZIM (under an internal `_mathjax_/` namespace).
- `--mathJaxConfig`: local path or HTTP(S) URL to an HTML file containing a single `<script>` tag with the MathJax configuration (this must be copied from the wiki, see below). Its content is injected inline, before the MathJax library, on every page that needs it. If the configuration needs to reference a path inside the MathJax archive (e.g. `MathJax.Ajax.config.path[...]`), it cannot use an absolute path since ZIMs have no fixed root URL. Write `__MATHJAX_ROOT__` instead of the leading slash and mwoffliner will replace it, on every page, with the correct relative path to the root of the MathJax archive you provided. For instance use `MathJax.Ajax.config.path["Contrib"] = "__MATHJAX_ROOT__/MathJaxExtensions/legacy";` if the resources are located in a `MathJaxExtensions/legacy` folder in the archive (inside the root folder of the archive if there is a single folder as usual).
- `--mathJaxEntryPoint`: path, relative to the root of the extracted archive, to the MathJax script to load (e.g. `es5/tex-chtml.js` for MathJax 3). Defaults to `MathJax.js` (MathJax 2 entry point).
- `--mathJaxAllPages`: inject the config/entry-point `<script>` tags on every page instead of only on pages detected to need MathJax (see below). Some wikis don't list MathJax in their page JS modules, which defeats the automatic detection; this flag works around that at the cost of adding the scripts to every page.

`--mathJaxConfig`, `--mathJaxEntryPoint` and `--mathJaxAllPages` all require `--mathJaxSource` to also be set. A page is considered to "need" MathJax, and only then gets the config/entry-point `<script>` tags injected, when one of the JS modules MediaWiki reports for that page matches `mathjax` (case-insensitive), unless `--mathJaxAllPages` is set, in which case every page gets them. The extracted library files themselves are always pushed to the ZIM as soon as `--mathJaxSource` is set, regardless of which pages use them.

### Preparing the parameters for a given wiki

1. **Find the live MathJax version and configuration.** Open a wiki page that renders math formulas, open your browser's developer console and type `MathJax.version` to get the exact version. Then find the configuration, typically a `<script>` block setting `window.MathJax = {...}` (MathJax 3/4) or `MathJax.Hub.Config({...})` (MathJax 2) in the page source — copy it as-is into a local file, e.g. `mathjax-config.html`.
2. **Find the exact entry point.** In your browser's network tab, find the request loading the MathJax library itself (typically named `MathJax.js` for MathJax 2, or a `tex-chtml.js`/`tex-svg.js`/... for MathJax 3/4) and note its full path, including any query string.
3. **Build a matching MathJax ZIP**, the exact steps depend on the major version in use (see below).
4. **Run the scraper** with the three parameters, e.g.:
   ```sh
   mwoffliner --mwUrl=https://your.wiki --adminEmail=foo@bar.net \
     --mathJaxSource=./mathjax-source.zip \
     --mathJaxConfig=./mathjax-config.html \
     --mathJaxEntryPoint=es5/tex-chtml.js
   ```

### Building the ZIP — MathJax 2

MathJax 2 is not published to npm as an installable package; it is only distributed as source on GitHub. Download a release archive directly from the [MathJax releases page](https://github.com/mathjax/MathJax/releases) (e.g. `2.7.9`) and use it as-is as `--mathJaxSource`, no re-zipping needed:

```sh
curl -Lo mathjax-source.zip https://github.com/mathjax/MathJax/archive/refs/tags/2.7.9.zip
```

The archive has a single top-level folder (e.g. `MathJax-2.7.9/`); mwoffliner strips it automatically when extracting.

Unlike MathJax 3/4, MathJax 2 loads its extensions/output-processor via a `config=` query parameter on the `MathJax.js` request itself (e.g. `MathJax.js?config=TeX-MML-AM_CHTML`) rather than solely through the injected configuration script — this is the URL you captured in step 2 above. Set `--mathJaxEntryPoint` to that same path and query string, e.g.:

```sh
--mathJaxEntryPoint="MathJax.js?config=TeX-MML-AM_CHTML"
```

The referenced combined-configuration file (here `config/TeX-MML-AM_CHTML.js`) is part of the standard MathJax 2 distribution, so it is already included in the ZIP from the release archive.

### Building the ZIP — MathJax 3

MathJax 3 is published to npm as `mathjax-full`, which bundles both the compiled runtime (under `es5/`) and the TypeScript sources (which mwoffliner automatically ignores when an `es5/` folder is present):

```sh
npm install mathjax-full@3.2.2
cd node_modules/mathjax-full && zip -r ../../mathjax-source.zip . && cd ../..
```

Entry point example: `--mathJaxEntryPoint=es5/tex-chtml.js`.

### Building the ZIP — MathJax 4

MathJax 4 moved to scoped npm packages. Use the plain `mathjax` package (deployment-ready bundle), **not** `@mathjax/src` (the TypeScript source package meant for building MathJax itself, which requires separately installing font packages):

```sh
npm install mathjax@4
cd node_modules/mathjax && zip -r ../../mathjax-source.zip . && cd ../..
```

Unlike MathJax 3, entry-point files live at the root of the package (no `es5/` folder), e.g. `--mathJaxEntryPoint=tex-chtml.js`.

## Background

Complementary information about MWoffliner:

- **MediaWiki software** is used by thousands of wikis, the most famous ones being the Wikimedia ones, including [Wikipedia](https://wikipedia.org).
- **MediaWiki** is a PHP wiki runtime engine.
- **Wikitext** is the markup language that MediaWiki uses.
- **MediaWiki parser** converts Wikitext to HTML, which displays in your browser.
- Read the [scraper functional architecture](docs/functional_architecture.md) for more details.

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0) or later, see [LICENSE](LICENSE) for more details.

## Acknowledgements

This project received funding through [NGI Zero Core](https://nlnet.nl/core), a fund established by [NLnet](https://nlnet.nl/) with financial support from the European Commission's [Next Generation Internet](https://ngi.eu/) program. Learn more at the [NLnet project page](https://nlnet.nl/project/MWOffliner).

[<img width="20%" alt="NLnet foundation logo" src="https://github.com/user-attachments/assets/22233242-ec49-4540-a0af-b70725cedbee" />](https://nlnet.nl/)
[<img width="20%" alt="NGI Zero Logo" src="https://github.com/user-attachments/assets/1bbbda57-dc6f-4902-ae29-236e5e89228f" />](https://nlnet.nl/core)
