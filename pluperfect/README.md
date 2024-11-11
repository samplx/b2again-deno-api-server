# b2again-legacy-repo-sync

A set of [Deno](https://docs.deno.com/)
[Typescript](https://www.typescriptlang.org/docs/handbook/intro.html) programs that are
designed to create an unofficial mirror of a legacy CMS project's
public assets.

## Archive sizes

The tools now support four archive modes.

- basic
- live
- zips
- full

A **basic** archive is the default. This is just an archive of
the required meta data and _one_ read-only zip file for each plugin or theme.
Only the current version is downloaded.

A **live** archive adds copies of all of the current screenshots, sample pages, and
for plugins: banners.

A **zips** archive includes **all** zip file versions. Note that some plugins and themes
have hundreds of versions, which are a large contribution to the size of the archive.

A **full** archive includes everything: **minimal**, **live** and **zips**.

The initial runs were using the `subversion` list. This is a list of plugins or themes based upon
directory names in the subversion repositories. While this has the most number, there are large
numbers of **404** for plugins and themes to which `api.wordpress.org` knows nothing. So, the
code now has provisions to use different lists (see below). The default is now the list of
`updated` plugins and themes.

### Plugins

The preliminary numbers are ~30 GB for partial plugin download. Full download is ~644 GB.
The first pass complete using the subversion repository list. I will update with
additional information as it becomes available. I am using two Droplets to test.
One has 2 GB of RAM, the other 8 GB. Both are using `debian 12` and `Deno 2.0.2`.

#### List: subversion

There are a total of 103 266 plugins in the `subversion` list.

```bash
$ du -hs plugins/*
37G	    plugins/live
1.7G	plugins/meta
605G	plugins/read-only
```

#### List: updated

There are around 60k plugins in the `updated` list.

After a **basic** download.

```bash
$ du -hs build/plugins/*
1.7G	build/plugins/meta
32G	build/plugins/read-only
```

```text
pluperfect v0.5.0
started:   Thu, 24 Oct 2024 08:08:26 GMT
...
Total plugins processed:  59927
Total successful:         59757
Total failures:           12
Total skipped:            158
completed: Thu, 24 Oct 2024 15:27:01 GMT
```

After a **live** download. The first time I ran this I discovered
an issue that I think I may leave as is. After I had downloaded
the **basic** plugins repository, I then executed a
`./pluperfect.ts --live --verbose` command. While this did enable a
**live** archive, it didn't expand the existing archive, it just added
the live data when a plugin was updated. This means that only 193
plugins worth of **live** data was actually available after.
Since the JSON files don't know the state of the archive, it doesn't
recognize that **existing** entries need to be refreshed.
I could add a bunch of code, but for now, I just add the `--force`
option to get the desired result. (and re-run the test).

```bash
$ du -hs build/plugins/*
403M	build/plugins/live
1.7G	build/plugins/meta
33G	build/plugins/read-only
```

```text
pluperfect v0.5.0
started:   Thu, 24 Oct 2024 15:33:46 GMT
...
Total plugins processed:  59924
Total successful:         193
Total failures:           0
Total skipped:            59731
completed: Thu, 24 Oct 2024 15:40:15 GMT
```

After the re-run.

```bash
$ du -hs build/plugins/*
37G	build/plugins/live
1.8G	build/plugins/meta
32G	build/plugins/read-only
```

```text
pluperfect v0.5.0
started:   Thu, 24 Oct 2024 16:45:46 GMT
...
Total plugins processed:  59860
Total successful:         59294
Total failures:           204
Total skipped:            362
completed: Fri, 25 Oct 2024 04:29:51 GMT
```

Note: It appears that plugins are being removed from the `api.wordpress.org` registry.

After a **zips** download.

- [TBD]

After a **full** download.

- [TBD]

### Themes

The preliminary numbers are ~22 GB for partial themes download and ~306 GB for a full download.
The list of themes is taken from the subversion repository HTML page at `https://themes.svn.wordpress.org/`.

#### List: subversion

There are 27 531 themes in the `subversion` list.

```bash
$ du -hs themes/*
5.0G	themes/live
351M	themes/meta
301G	themes/read-only
```

#### List: updated

There are around 13k themes in the `updated` list.

After a **basic** download.

```bash
$ du -hs build/themes/*
209M	build/themes/meta
18G	build/themes/read-only
```

```text
themattic v0.5.0
started:   Thu, 24 Oct 2024 07:39:19 GMT
...
Total themes processed:   12985
Total successful:         12984
Total failures:           1
Total skipped:            0
completed: Thu, 24 Oct 2024 09:46:26 GMT
```

After a **live** download.

```bash
$ du -hs build/themes/*
4.9G	build/themes/live
223M	build/themes/meta
18G	build/themes/read-only
```

```text
themattic v0.5.0
started:   Thu, 24 Oct 2024 11:38:10 GMT
...
Total themes processed:   12987
Total successful:         12904
Total failures:           83
Total skipped:            0
completed: Thu, 24 Oct 2024 16:22:37 GMT
```

After a **zips** download.

```bash
$ du -hs build/themes/*
301M	build/themes/meta
298G	build/themes/read-only
```

```text
themattic v0.5.0
started:   Thu, 24 Oct 2024 16:41:58 GMT
...
Total themes processed:   12987
Total successful:         12896
Total failures:           88
Total skipped:            3
completed: Fri, 25 Oct 2024 23:01:51 GMT
```

After a **full** download.

```bash
$ du -hs build/themes/*
5.6M	build/themes/live
202M	build/themes/meta
298G	build/themes/read-only
```

```text
```

The execution of `thematic.ts --full --retry`, which uses the default `update`
list on a 2 GB Droplet takes a little over 3 minutes.
This would need to be executed periodically to keep the repo up-to-date with upstream.
It is not clear what the expected arrival rate is for new theme versions. A once every four hours update rate
seems like a reasonable starting point that would not put significant demand on upsteam resources.
Although once a day may be sufficient for most needs.

### Core

Core has three dimensions of control of the size of the archive. The first are which releases
to download, the second is the locales to be downloaded. A release can be in one of three
states: `latest`, `outdated` or `insecure`. The `en_US` locale is always included since it
is the basis for the other releases. Normally, all configured locales are archived, but the
`--localesFilename` can be used to load a JSON w/comments file containing a list of locales.
Also, the `--locales=name` option can be used one or more times to include a locale in the
archive. The third dimension determines if all of the archives will be downloaded, or just
the main release wordpress ZIP file (and associated .sh1 and .md5 files). If the `--full`
or the `--zips` options is specified, all of the archive files will be downloaded. Otherwise,
only the main ZIP will be.

After a download of all releases, but with only the main ZIP archive:

```bash
$ du -hs build/core/*
7.3G	build/core/meta
41G	build/core/read-only
```

```text
midst v0.5.2
started:   Sat, 26 Oct 2024 23:58:03 GMT
...
completed: Sun, 27 Oct 2024 05:53:23 GMT
```

After a download of all releases, with `--full` option to get all archives:

```bash
$ du -hs build/core/*
7.4G	build/core/meta
418G	build/core/read-only
```

```text
midst v0.5.2
started:   Sun, 27 Oct 2024 07:50:58 GMT
> mkdir -p build/core/meta/legacy
first we need to read the previous latest
next we need a list of releases
fetch(https://api.wordpress.org/core/stable-check/1.0/) > build/core/meta/legacy/legacy-releases.json
previous latest release:   6.6.2
latest release:            6.6.2
number of releases:        745
list:                      all
...
completed: Sun, 27 Oct 2024 22:46:57 GMT
```

## pluperfect.ts

A tool to mirror wordpress.org plugins and associated files.

## themattic.ts

A tool to mirror wordpress.org themes and associated files.

## midst.ts

A tool to mirror wordpress.org core releases and associated files.

## Limitations

The current implementation is single-threaded.
Slow and steady doesn't put an undue burden on up-stream resources. Once
the archive is downloaded, updates are minimal and not time critical.
It is hard to justify a need for up-to-the-minute mirroring, when a
once a day update schedule may meet most needs.
Again, it is open source, so someone can multi-thread it if they want.

<s>The current implementation is also has a considerable memory footprint.
It requires a 8GB Droplet to download the plugins. A 2GB Droplet was able
to download the themes. Future versions may address this.</s>
After version `0.3.0`, a 2 GB Droplet was able to download both themes and plugins.

## Lists

The tools support a list of items to be downloaded. The items, plugins or themes, are
identified by their **slug**. For example, everyone's favorite plugin to delete has
the slug `hello-dolly`.

Currently, the following list types are supported:

- `subversion`
- `interesting`
- `defaults`
- `featured`
- `new`
- `popular`
- `updated`

The initial tools only supported gathering the list from the subversion page, so that list is
called `subversion`. This page is
problematic since around half of the entries are not valid. This leads to a whole lot of
**404**'s as we attempt to get the detailed information about a plugin or theme that does
not exist. It is however, the largest list, if you don't want to miss anything.

As an alternative, there are two sources. First, a list of slugs can be read from a file.
This would allow for someone to easily create a mirror of the plugins and themes that they
find _interesting_. So the list is named `interesting`.

There is also the existing wordpress API at `api.wordpress.org`. This has REST API's that
provide information about groups of plugins and themes. They have a `browse` parameter,
each setting of which leads to another supported list type. The default (not provided)
value results in the `defaults` list. Then the `featured`, `new`, `popular` and `updated`
values for `browse` correspond to the same name in a list.

At least with themes, there is data that comes from `api.wordpress.org` when a list of
themes is requested that is not included when a single theme's information is requested.
This means that the `themes.json` file that is generated includes information from
the list of themes from the API, information about a specific theme from `legacy-themes.json`,
in addition to the localization changes.

## Directory structure

### `/live`

Contains mutable files associated with the "current" version.
Under this directory there are screenshots, sample pages, and banners (plugins).
Only exists in **full** or a **live** archive.

Files in the live tree are renamed to make them cache friendly. The **SHA-256**
of the file contents are then used to construct a file name. In order to support
this structure, the files must be downloaded before the script can determine
if there is any change. If the message digests match, the files are considered
to have the same content. The new file is discarded so that the timestamps
remain with the older file.

### `/meta`

Contains mutable JSON file describing the archive. The contents of the JSON is
can be used to serve the WP compatible API.

### `/read-only`

Contains immutable **zip** files. These files are marked read-only
in the archive. They are assumed to be immutable, at least for performance
purposes. Immutable for businesses reasons is beyond the scope of these tools.

### `legacy` directory

In order to distinguish content that came from upstream sources, and any future
local development, a `legacy` directory level is added.

### (Two-letter) Prefix Directory

The existing legacy layout favors an **all-in-one** approach. It has more
than one directory with over 100 000 entries. As a premature optimization,
I will not replicate this.
I have not tested this, but I think the
operating system can optimize two lookups of much smaller directories
rather than a single lookup of 100 000 entries. Just think of the
cycles spent after the `ls` and before the **Control-C**. Plus at some
point, web servers, etc. have to handle sorted lists of 100 000 entries.
Sorry, not going to do it.

So, after a minimal amount of testing, I settled on a two-letter prefix
followed by the full name for large (plugins, themes) lists. Of course, the
**wp** directory will always be an outlyer, still 8 692 is **much** less than
103 234 entries long (recent values). So there are about 900 prefix directories,
each with an average near 120 plugins or themes inside.

And of course, this being open-source, you can change it for your archive.
There is an `--prefixLength` option to alter the layout. A `prefixLength`
less than zero will give you a set of reports on how things break down for
prefix lengths of 1, 2, 3 and 4. Anything else, you need to hack some code.
A `--prefixLength=0` option should remove the prefix directory altogether, but
I didn't spend much time testing it.

#### Unicode Prefix Directory

There are Subversion directory names which have a first character with a
code point past 'z'. These I call "Unicode" or "Post-ASCII" directories
(although as a pedantic fool, I must point out that all directores are
named with Unicode characters.)

As of today, none of these plugins nor themes actually have been "released",
in that the `api.wordpress.org` API still does not recognize a **Post-ASCII** slug.

As an example of future proofing/over-engineering, these all get put into
a single **overflow** prefix directory, with the name `zz+`.

### live leaf directory

At the _leaf_ of each plugin or theme directory structure is a **live**
directory. This directory contains an optional `screenshots` directory.
Plugins may have a `banners` directory. Themes have an optional `preview` directory.
The screenshots and banners are typically PNG format files, with some JPG or others.
The `preview` directory usually contains a single `index.html` file.

### meta leaf directory

Each plugin or theme has a directory that contains the **JSON** format files
that describe the item and its contents. There are usually two files in
the directory. A _legacy_ file which comes from the upstream server, and
the _active_ file which may be used to serve API content. The _active_
file may be patched with data from multiple data sources, and may be
redacted as well. It also has URLs translated to downsteam versions.

### read-only directory

Each plugin or theme has a directory that contains **Zip** format files.
These are the _contents_ of the plugin or theme. They are archived
as **read-only** files as recieved from the upsteam source. The version
number is embedded in the file name. In a **full** archive, most
directories have multiple versions. In a **partial** archive, only a single
version is downloaded, although older versions are not purged.

### An example - acid-rain theme

The **partial** archive of the _acid-rain_ theme includes the following files:

- `themes/meta/ac/acid-rain/theme.json`
- `themes/meta/ac/acid-rain/legacy-theme.json`
- `themes/read-only/ac/acid-rain/acid-rain.1.1.zip`

The **full** archive of the _acid-rain_ theme adds the following files:

- `themes/live/ac/acid-rain/preview/index.html`
- `themes/live/ac/acid-rain/screenshots/screenshot.png`
- `themes/read-only/ac/acid-rain/acid-rain.1.0.1.zip`
- `themes/read-only/ac/acid-rain/acid-rain.1.0.zip`
