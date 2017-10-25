## Custom Links

[![License][lic-img]][lic]
[![Continuous integration status][ci-img]][ci]
[![Coverage Status][cov-img]][cov]
[![Static analysis status][sa-img]][sa]

[lic-img]: https://img.shields.io/github/license/mbland/custom-links.svg
[lic]:     https://github.com/mbland/custom-links/blob/master/LICENSE.md
[ci-img]:  https://img.shields.io/travis/mbland/custom-links/master.svg
[ci]:      https://travis-ci.org/mbland/custom-links
[cov-img]: https://img.shields.io/coveralls/mbland/custom-links/master.svg
[cov]:     https://coveralls.io/github/mbland/custom-links?branch=master
[sa-img]:  https://img.shields.io/codeclimate/github/mbland/custom-links.svg
[sa]:      https://codeclimate.com/github/mbland/custom-links

Source: https://github.com/mbland/custom-links

An application for allowing authenticated users to create and dereference custom
URLs hosted on a custom domain.

For example, if you run an instance of Custom Links that can be accessed via
your network using the hostname `go`, you can create memorable custom links such
as `go/cl` that redirect to longer target URLs such as
`https://github.com/mbland/custom-links`.

You can update the target URLs for links you own, and transfer ownership to
other users.

It runs on [Node.js][] and uses [Redis][] as a backing store.

[Node.js]:        https://nodejs.org/
[Redis]:          https://redis.io/

### Table of contents

- [Installation](#installation)
- [Credentials](#credentials)
- [Configuration](#configuration)
- [Development](#development)
- [Installing Bash](#installing-bash)
- [Open Source](#open-source-license)

### Installation

1. Install [Node.js][] on your system. This system requires version 4.2 or
   greater or version 5 or greater. You may wish to first install a version
   manager such as [nvm][] to manage and install different Node.js versions.
1. Install [Redis][] on your system. This system works with version 3, but
   version 4 or greater is recommended.
1. If the [Bash shell][bash-wikipedia] isn't available on your system, see the
   [Installing Bash](#installing-bash) section later in this document.
1. In the root directory of the application, run the following to install the
   necessary [npm][] packages and to ensure that the application is functioning
   properly:
   ```bash
   $ ./go
   ```
1. Create [app credentials](#credentials).
1. [Configure the application](#configuration).
1. **To run the server locally for testing and development**, save your
   configuration as `test-config.json` and run the following command from the
   root directory of the application:
   ```bash
   $ ./go serve
   ```
1. **To run a production instance of the server**, run the following command
   from the root directory of the application, where `config.json` is the path
   to your configuration file:
   ```bash
   $ ./go serve config.json
   ```
   Alternatively, you can specify the path to the configuration file via the
   **CUSTOM_LINKS_CONFIG_PATH** environment variable:
   ```bash
   $ CUSTOM_LINKS_CONFIG_PATH=config.json ./go serve
   ```

[nvm]:            https://github.com/creationix/nvm
[bash-wikipedia]: https://en.wikipedia.org/wiki/Bash_%28Unix_shell%29
[npm]:            https://www.npmjs.com/

### Credentials

Right now, only Google OAuth 2.0 is supported, though the [Passport][]-based
authentication scheme permits the addition of other authentication providers and
strategies.

1. On the [credentials page of the Google Developer's console][dev-creds], click
   the **Create credentials** button and select **OAuth client ID**.
1. Select **Web application**.
1. Fill in the following values:
   * **Name**: "Custom Links server" or whatever you wish
   * **Authorized JavaScript origins**: The root URL of your Custom Links
     server. If you're only testing locally, use `http://localhost:3000`
   * **Authorized redirect URIs**: The root URL of your Custom Links server
     followed by `/auth/callback`. If testing locally, this should be
     `http://localhost:3000/auth/callback`. You will use this value to set the
     **GOOGLE_CALLBACK_URL** configuration variable.
1. Click **Create**.
1. Make note of the client ID and client secret values, and use them to set the
   **CUSTOM_LINKS_GOOGLE_CLIENT_ID** and **CUSTOM_LINKS_GOOGLE_CLIENT_SECRET**
   configuration variables.

[Passport]:  http://passportjs.org/
[dev-creds]: https://console.developers.google.com/apis/credentials

### Configuration

You will need to provide a configuration file in JSON format that defines the
following required fields:

* **PORT**: The port number on which the server will listen
* **AUTH_PROVIDERS**: The name of the authentication provider to use, which
  corresponds to one of the file names in `lib/auth` without the `.js` suffix
  * This is a list, since the system may support multiple providers one day; but
    for now, it should contain only one entry.
* **SESSION_SECRET**: A secret key used to encrypt user sessions; see the
  [Environment variables](#environment-variables) section below. A handy way of
  generating this value, if you have [Ruby][] installed on your system:
  ```bash
  $ ruby -rsecurerandom -e 'puts SecureRandom.hex(20)'
  ```

[Ruby]: https://www.ruby-lang.org/

You must also provide at least one of the following fields:

* **users**: A list of specific user account names (usually email addresses)
  that are authorized to access the server. (Case insensitive)
* **domains**: A list of user domains (i.e. email address domains) that are
  authorized to access the server. (Case insensitive)

You may define both of these fields if you wish.

The following fields are optional:

* **REDIS_PORT**: The port your redis-server, if not the default (6379)
* **SESSION_MAX_AGE**: Maximum age of a user session, in seconds

The following fields are required by the Google OAuth provider (see the
[Credentials](#credentials) section above):

* **GOOGLE_CALLBACK_URL**
* **GOOGLE_CLIENT_ID**
* **GOOGLE_CLIENT_SECRET**

A complete example looks like the following:

```json
{
  "PORT": 3000,
  "AUTH_PROVIDERS": [ "google" ],
  "REDIS_PORT": 6379,
  "SESSION_SECRET": "<session secret>",
  "SESSION_MAX_AGE": 3600,
  "GOOGLE_CLIENT_ID": "<client ID>",
  "GOOGLE_CLIENT_SECRET": "<client secret>",
  "GOOGLE_CALLBACK_URL": "http://localhost:3000/auth/callback",
  "users": [
    "mbland@acm.org"
  ],
  "domains": [
    "foo.example.com",
    "bar.example.com"
  ]
}
```

For local testing, you can define a `test-config.json` in the root directory of
the Custom Links instance; `./go serve` will find this file automatically.

For a production instance, you need to provide the path to the configuration via
one of the following methods, where `config.json` represents the path to your
configuration file:

```bash
$ ./go serve config.json
$ CUSTOM_LINKS_CONFIG_PATH=config.json ./go serve
```

#### Environment variables

Any of the string and numeric configuration variables (i.e. not list variables)
may be specified by corresponding environment variables prefixed with
**CUSTOM_LINKS_**, for example **PORT** could be specified as
**CUSTOM_LINKS_PORT**.

Specifically, the following variables should likely be specified as environment
variables and __not__ specified in any version-controlled configuration file:

* **CUSTOM_LINKS_SESSION_SECRET**
* **CUSTOM_LINKS_GOOGLE_CLIENT_ID**
* **CUSTOM_LINKS_GOOGLE_CLIENT_SECRET**

### Development

If you'd like to experiment with developing the system, start by creating an
alias for the `./go` script called `cl` like so:

```bash
$ eval "$(./go env cl)"
```

This alias allows you to run the `./go` script commands from anywhere, with tab
completion for commands that implement it. Begin familiarizing yourself with
`cl` commands by running:

```bash
$ cl --help
```

#### Running the tests

Run `cl -h` on any of the following commands for detailed information:

* `cl test` for server, browser, and end-to-end tests
* `cl test server` for server tests only
* `cl test browser` for browser tests only
* `cl test end-to-end` for end-to-end tests only

You can add the `--coverage` flag to `cl test`, `cl test server`, or `cl test
browser` to collect coverage using [NYC][]/[Istanbul][].

[NYC]:      https://www.npmjs.com/package/nyc
[Istanbul]: https://www.npmjs.com/package/istanbul

Also see the [Caveat: Karma and Safari](#caveat-karma-and-safari) section below
if you plan to test against Apple's Safari browser.

#### Local environment variables

Read through the `.config/env.template` file, and consider making a copy as
`.config/env.local` and customizing the variables within this copy as described
in the file. Of particular interest are the **SELENIUM_BROWSER** and
**KARMA_BROWSERS** variables.

#### Code organization

`index.js` is the main file used to start the server.

`lib/` contains all of the server-side implementation. `lib/index.js` is the
entry point. `lib/auth` contains [Passport][]-compatible authentication objects.

`public/` contains all the front-end code. `public/index.html` is the single
HTML file for the application. `public/tests/tests.js` contains all the user
interface tests. `public/tests/lib.js` contains helper functions for the UI test
suite.

`tests/server` contains all of the server-side tests. `tests/end-to-end`
contains the [Selenium-WebDriver][] tests. `tests/helpers` contains various test
helper functions, configurations, and support servers.

[Selenium-Webdriver]: https://www.npmjs.com/package/selenium-webdriver

`scripts/` contains the individual `./go` command scripts.
`scripts/go-script-bash` contains the [go-script-bash][] framework upon which
the `./go` script system is built.

[go-script-bash]: https://github.com/mbland/go-script-bash

#### Installing karma-cli

If you wish to use the [Karma][] test runner while updating and testing the user
interface, make sure to install [karma-cli][] via:

```bash
$ npm install -g karma-cli
```

[Karma]:     https://karma-runner.github.io/
[karma-cli]: https://www.npmjs.com/package/karma-cli

Now you can run the browser-only tests using one of:

```bash
# To keep all browsers running and refreshing automatically on file changes:
$ karma start

# To close all browsers after a single run:
$ karma start --single-run
```

#### Caveat: Karma and Safari

There are two issues that currently require manual intervention when using Karma
with Safari:

* When Safari first opens after `karma start`, [the Safari tests will not make
  progress until Safari is clicked on or otherwise selected as the foreground
  window][ksl-24]. (This doesn't happen with `karma start --single-run`.)
* Since Karma doesn't explicitly close browser tabs upon exit, [Karma tabs may
  still be open the next time it runs][karma-878], which may cause Karma to
  timeout and report a failure. The workaround for now is to open Safari and
  close any open Karma tabs in between `karma start` runs.

[ksl-24]: https://github.com/karma-runner/karma-safari-launcher/issues/24
[karma-878]: https://github.com/karma-runner/karma/issues/878

### Installing Bash

If you're using a flavor of UNIX (e.g. Linux, OS X), you likely already have a
suitable version of Bash already installed and available. If not, use your
system's package manager to install it.

On Windows, the [Git for Windows][git-win], [MSYS2][] and [Cygwin][]
distributions all ship with a version of Bash. On Windows 10, you can also use
the [Windows Subsystem for Linux][wsl].

[git-win]: https://git-scm.com/downloads
[wsl]:     https://msdn.microsoft.com/en-us/commandline/wsl/about
[msys2]:   https://msys2.github.io/
[cygwin]:  https://www.cygwin.com/

### Open Source License

This software is made available as [Open Source software][oss-def] under the
[ISC License][].  For the text of the license, see the [LICENSE](LICENSE.md)
file.

[oss-def]:     https://opensource.org/osd-annotated
[isc license]: https://www.isc.org/downloads/software-support-policy/isc-license/


