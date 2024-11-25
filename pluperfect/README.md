# pluperfect.ts

A [Deno](https://docs.deno.com/)
[Typescript](https://www.typescriptlang.org/docs/handbook/intro.html) program that is
designed to maintain a repository of the legacy WordPress.org public assets.

It is named after the favorite Latin tense of lawyers, [_plus quam perfect_](https://en.wikipedia.org/wiki/Pluperfect).
In English, we usually say past perfect, but **pluperfect** is pedantic like me.
As in, “You should have _had made_ other plans to access WordPress.org assets.”

The long-term goal is a federated set of repositories, but we need to walk before we can run.
Today, the MVP is to keep a single repo in sync with what is available upstream with no more
than a 24 hour delay. Nice for the delay to be no more than two hours.

When available, the repo files will live at [downloads.b2again.org](https://downloads.b2again.org/).

The files will be followed by the api server (_blue-eyes_) at [api.b2again.org](https://api.b2again.org/).


## Some Concepts

To define things before I forget, let me introduce some concepts as they are used
with the **b2again** project.

The first project goal is the creation of a repository (or repo) of digital assets that are
associated with WordPress software and are normally accessed from WordPress.org.
This repo, in turn, will be used to drive the api server (_blue-eyes_).

To start, we will only have the existing assets. For b2again.org, assets that come
from WordPress.org and its associated sites are called **legacy**.

There are four **asset groups**:

* core
* patterns (not yet handled)
* plugins
* themes

Files associated with these assets fit into four basic **asset roles**:

* meta
* live
* read-only
* stats

The download process has basic **download steps**:

* list
* meta
* readOnly
* l10n
* live
* summary

The `pluperfect.ts` command supports a number of command-line options.
These options control which subset of data is downloaded and how.

All **b2again-deno-tools** (this repo) share the concept of `StandardConventions`.
The conventions are how we allow “infinite bike-shedding” as a feature.
It will get a document of its own when I get around to it.
But the conventions handle most of what is considered _configuration_.

`pluperfect.ts` will attempt to read a file `.env` in the current directory
when it is started.
Any values read will supplement the process' environment variables.

### Command-line Options

* group options: `--core`, `--patterns`, `--plugins`, `--themes`
* step options: `--list`, `--meta`, `--readOnly`, `--l10n`, `--live`, `--summary`
* rehash option: `--rehash`
* force option: `--force`
* log output options: `--json`, `--quiet`
* limit options: `--synced`, `--noChangeLimit=N`
* information: `--help`, `--version`

#### Group Options

Normally, `pluperfect.ts` is limited to a single archive group at a time using one of the group options.
This is done for performance reasons.
It makes sense to run a copy for each group.

If none of the options are selected, each of the groups will be attempted in turn.

#### Step Options

It is possible to limit the processing of a `pluperfect.ts` run by using specific step options.

If none of the options are selected, it is the same as selecting all of them.

Note: It is possible to limit the content downloaded by not executing steps,
but that this may lead to 404 errors.
If the `--l10n` step is not executed, no localization (l10n) files will be downloaded.
If `--live` is avoided, the assets will never be downloaded, but the references to them will
still exist.

#### Rehash Option

Depending upon the `StandardConventions` the `pluperfect.ts` script supports maintaining a `read-only` and `live` files in an S3 bucket.
They can also be maintained as local files.
The `--rehash` option acts differently based upon if it is acting on local files or on S3 based ones.
The idea is to re-read the files in order to re-calculate the message digests.
This make sense on local files, but on S3 based files, it is nearly the same as a `--force` option.
It has a use with the `--live` step to force a re-download of all files. In this case, unlike the `--force` option, any existing live files are kept, but an attempt to download the file is made to see if the SHA-256 changed.

#### Force Option

Normally, we want to limit the scope of changes.
If we have a file already, we don't download it again.
The `--force` option will cause any asset that exists to be deleted before this check.
This will force all files to be downloaded.
**This is not normally what you want to do.**

#### Log Output Option

Normally, text logging is enabled.
This can be changed to a structured JSON format using the `--json` option.
If no logging is desired, a `--quiet` option is available.
Errors are always logged in text format.

#### Limit Options

We do not have reliable timestamps from upstream to tell
us if the data has changed. Some options control how we limit the download rather than just waste bandwidth.

The `--synced` option indicates that the repo should be considered in a **synced** state.

The `--noChangeLimit=N` option sets the **no-change-limit**, which is the number of items which are downloaded without change before the download attempt stops.

The idea is that there are a small subset of files which can be downloaded, and then we can stop because so many files have no changes.
There is a trade-off between giving up early so we can go back to seeing if there are any new items, and checking the entire list every time so that no changes are missed.

#### Information Options

The `--help` option provides a short help message and exits. The `--version` option prints the version and exits.

### Asset Groups

The **core** group represents the main WordPress release, there are about 750 releases.
The **patterns** are associated with the block editor, there are about 2&nbsp;000 patterns.
The **plugins** are used to extend WordPress. There are about 59&nbsp;000 plugins.
A **theme** is used to alter the appearence of WordPress. There are about 13&nbsp;000 themes.


### Asset Roles

The **meta** data files contain information to be returned by the api that reference
the contents of the repository. Meta data changes. The time-to-live is minutes to an hour.

The **live** data files contain assets that are associated with the current _live_ version,
rather than being versioned themselves. For example, screenshot files. The screenshot assets
that are currently available are captured, but past versions are no longer available, and
future versions may be introduced with any new theme or plugin version.
To make the live files more cache friendly,
we add a content-hash to their names.
This means that when a live file changes, so does its name.
This leads to a time-to-live for these files of days to years.

The **read-only** data files contain the bulk of what people have associated with a repository.
The `.zip` and `.tar.gz` files that contain the released code and assets. Since it depends
upon the mecurial nature of upstream, it is not clear if these assets are immutable, but
b2again.org assumes that they are. The time-to-live for these files is days to years.

The **stats** data files are not maintained by `pluperfect.ts`. As a privacy focused project,
b2again **does not track usage**. So the **stats** data files are filled with dummy
data provided out-of-band. As dummy files, they have a long time-to-live. If they are
being populated out-of-band, that process will define the time-to-live.

### Download Steps

There are a series of steps used to download each group of assets. In general, the flow
is first by Asset Group, then by a global first step, and individual steps that are
repeated for each member of the group.
The first step, **list** gathers the members of the group.
Then each of the remaining steps is executed in turn against each member of the list.


#### List

Controlled by the `--list` option. This step gathers the lists of members of the asset group.

For core assets, there is only a single upstream list: all of the releases.
For plugins and themes there are multiple lists based upon the upstream API _browse option_.
There are `new`, `default`, `updated`, `featured`, and `popular` lists of themes and plugins.

There is also an optional `interesting` list, that can be used to limit the repo to only a select list. There is also an optional `rejected` list, that defines plugins or themes from upstream that are not maintained.

When the `--list` option is selected, `pluperfect.ts` will query upstream for data to populate the lists. After some processing, it will create an `effective` list of themes and plugins. The `effective` list is what is used in the remaining steps.

When the `--list` option is _not_ selected, `pluperfect.ts` will read the `effective` list rather than query upstream. This is primarily used during development.

#### Meta

Both plugins and themes have meta data associated with them that is delivered by `api.wordpress.org`.
When the `--meta` step is executed, this meta data is requested from upstream.

The API data is then compared with any previous copy to determine if there were any changes.
The values from the upstream data is then **migrated** to local values.
The upstream and migrated data is stored, and that as well as if there was any change is used in later processing.

Each core release, plugin, or theme is associated with a **request group**. This defines the list of files that need to be downloaded. It also has an associated status JSON file. This file contains the current status of the downloads. It describes the status of each file, including any message digests. Each also has an optional list of **translations**.

During the meta stage, the files necessary

#### Read-Only

When the `--readOnly` option is in effect, `pluperfect.ts` will attempt to download files
that do not already exist in the repo.

#### L10N

#### Live

#### Summary

### .env File

It is a standard `.env` file to allow injecting secrets
via environment variables. The current `b2again-conventions.ts` require a single
S3 Sink to be defined, with seven associated environment variables.

```bash
R2DOWNLOADS_PORT="443"
R2DOWNLOADS_USE_SSL="true"
R2DOWNLOADS_END_POINT="account-id.r2.cloudflarestorage.com"
R2DOWNLOADS_BUCKET="bucket-name"
R2DOWNLOADS_ACCESS_KEY="access-key"
R2DOWNLOADS_SECRET_KEY="secret-key"
R2DOWNLOADS_REGION="auto"
```

## Repository Size

**TL;DR** With the current settings, the bucket size of repository is about 2 TiB.

While it is possible to use `pluperfect.ts` to create a subset repository that only
contains a portion of the **legacy** assets, this goal is secondary.
There are a number of optional limits that are not currently being used, and one that is.

What is being used is what I call the **version depth** setting.
The upstream **legacy** repository contains every version of every plugin and theme.
Most third-party repositories appear to be maintaining
a single version.
At this time, `pluperfect` the plugin **version depth** is set to `10`. This will keep up-to ten (10) versions
of each plugin.
The theme **version depth** is `0` (zero) which acts as an infinite limit.


Other knobs include:

* limiting the core releases, plugins or themes that are maintained.
* limiting the locales that are maintained.


## Migration

All meta data is maintained in two versions. The upstream, or legacy version and the migrated version. The migration that is applied to all meta data is the mapping of URL's.

### Plugins

The following fields are effected by the migration process:

* `active_installs`
* `banners`
* `download_link`
* `homepage`
* `icons`
* `num_ratings`
* `preview_link`
* `rating`
* `ratings`
* `screenshots`
* `sections`
* `support_threads`
* `support_threads_resolved`
* `versions`

### Themes

The following fields are effected by the migration process:

* `active_installs`
* `author`
* `downloaded`
* `download_link`
* `homepage`
* `num_ratings`
* `parent`
* `preview_url`
* `rating`
* `ratings`
* `reviews_url`
* `screenshot_url`
* `sections`
* `versions`

