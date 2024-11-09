/*
 *  Copyright 2024 James Burlingame
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import * as path from "jsr:@std/path";

import {
    CommonUrlProvider,
    ContentHostType,
    ArchiveGroupName,
    MigrationContext,
    SlugUrlProvider,
    SlugVersionOriginalUrlProvider,
    splitDirname,
    StandardLocations,
    UrlProviderResult,
    SlugOriginalUrlProvider,
    SlugOriginalLiveUrlProvider,
    LiveUrlProviderResult,
    VersionLocaleVersionUrlProvider,
    SlugLocaleOriginalUrlProvider,
    SlugVersionUrlProvider
} from "./standards.ts";

/**
 * this is an implementation of a configuration object.
 * since the layout of directories and hosts is prone to
 * endless bike-sheding, it is all isolated in this bit of code.
 * the code is functional in nature. lots of higher-level functions,
 * currying, and the like.
 *
 * all the functions must be pure or this won't work.
 * if you don't know what a pure function is, you shouldn't touch this code.
 *
 * in general, the `StandardLocations` object is full of functions that
 * are called in order to create values rather than values themselves.
 * truly an endless frontier of potential options, but this is the
 * layout for the POC.
 *
 * for b2again.org, there is only a single 'downloads' host which holds
 * all of the files. the api, support and www hosts are virtual.
 * pluperfect will generate URL's that reference these hosts, but they hold
 * no archive files.
 *
 * the next configuration implementation will be a mirror of the upstream
 * resources. upstream however, has resources split across multiple hosts,
 * so the challenge was to create a set of code that could support both
 * without configuring hundreds of thousands of URL's "by hand".
 */

/**
 * create a url provider result for a specific logical host.
 * @param ctx bag of information used to translate urls.
 * @param host logical host name of the resource.
 * @param relative pathname relative to the host base directory.
 * @param upstream optional url to be requested.
 * @returns
 */
function bindHost(
    ctx: MigrationContext,
    host: ContentHostType,
    relative: string,
    upstream?: string,
    is_readonly?: boolean
): UrlProviderResult {
    const url = new URL(relative, ctx.hosts[host].baseUrl);
    let pathname;
    if (ctx.hosts[host].baseDirectory) {
        pathname = path.join(ctx.hosts[host].baseDirectory, relative);
    }
    return {
        host,
        url,
        pathname,
        upstream,
        is_readonly
    };
}

/**
 * create a url provider that involves a slug and a filename.
 * @param host which host holds the content.
 * @param sourceName name of the upstream source.
 * @param section group of data: core, plugins, themes.
 * @param filename last part of the name.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that is passed a slug value.
 */
function getFilenameSlugProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string,
    groupName: string = 'meta'
): SlugUrlProvider {
    return function (ctx: MigrationContext, slug: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        return bindHost(ctx, host, `/${groupName}/${section}/${sourceName}/${split}/${filename}`);
    }
}

function getFilenameSlugVersionProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string,
    postSplit: string = '',
    groupName: string = 'meta'
): SlugVersionUrlProvider {
    return function (ctx: MigrationContext, slug: string, version: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        return bindHost(ctx, host, `/${groupName}/${section}/${sourceName}/${split}${postSplit}/${version}/${filename}`);
    }
}

/**
 * create a url provider that involves a slug, locale and a filename.
 * @param host which host holds the content.
 * @param sourceName name of the upstream source.
 * @param section group of data: core, plugins, themes.
 * @param filename last part of the name.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that is passed a slug and a locale.
 */
function getFilenameLocaleSlugProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string,
    groupName: string = 'meta'
): SlugLocaleOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, locale: string, original: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        return bindHost(ctx, host, `/${groupName}/${section}/${sourceName}/${split}/l10n/${locale}/${filename}`, original);
    }
}

/**
 * create a url provider for a single file (no parameters).
 * @param host which host holds the content.
 * @param sourceName name of the upstream source.
 * @param filename last part of the name.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that provides a single url.
 */
function getCommonProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string,
    groupName: string = 'meta'
): CommonUrlProvider {
    return function (ctx: MigrationContext): UrlProviderResult {
        const relative = `/${groupName}/${section}/${sourceName}/${filename}`;
        return bindHost(ctx, host, relative);
    }
}

/**
 * create a url provider that depends upon a slug, version and the original url.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param postSplit additional contents after the split directory/slug portion.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that needs a slug, version and original url.
 */
function getSlugVersionOriginalUrlProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    postSplit: string = '',
    groupName: string= 'read-only'
): SlugVersionOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, version: string, original: string): UrlProviderResult {
        const filename = path.basename(original);
        const split = splitDirname(ctx, section, slug);
        const relative = `/${groupName}/${section}/${sourceName}/${split}${postSplit}/${version}/${filename}`;
        return bindHost(ctx, host, relative, original, true);
    }
}

function getSlugVersionLocaleUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    groupName: string= 'read-only'
): SlugVersionOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, version: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, slug);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/${version}/l10n/${locale}.zip`;
        const original = `https://${downloadsHost}/translation/${section}/${slug}/${version}/${locale}.zip`;
        return bindHost(ctx, host, relative, original, true);
    }
}

/**
 * create a url provider that depends upon a slug and the original url.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that depends upon a slug and (potentially) the original url.
 */
function getSlugUrlProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    groupName: string
): SlugOriginalUrlProvider {
    return function (ctx: MigrationContext, slug: string, _original: string): UrlProviderResult {
        const relative = `/${groupName}/${section}/${sourceName}/${slug}/`;
        return bindHost(ctx, host, relative);
    }
}

/**
 * create a live url provider that depends upon a slug and the original url.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param fileType screenshots, banners, preview.
 * @returns higher-order function that depends upon the slug and the original url.
 */
function getSlugOriginalLiveUrlProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    fileType: string,
    groupName: string = 'live'
): SlugOriginalLiveUrlProvider {
    return function (ctx: MigrationContext, slug: string, original: string): LiveUrlProviderResult {
        const filename = path.basename(original);
        const split = splitDirname(ctx, section, slug);
        const dirname = `/${groupName}/${section}/${sourceName}/${split}/${fileType}/`;
        const lastDot = filename.lastIndexOf('.');
        const front = (lastDot < 0) ? filename : filename.substring(0, lastDot);
        const extension = (lastDot < 0) ? '' : filename.substring(lastDot).toLowerCase();
        return {
            host,
            dirname,
            front,
            extension
        }
    }
}

/**
 * create a live url provider for an index.html file that depends upon a slug and the original url.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param fileType screenshots, banners, preview.
 * @returns higher-order function that depends upon the slug and the original url.
 */
function getSlugLiveIndexUrlProvider(
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    fileType: string,
    groupName: string = 'live'
): SlugOriginalLiveUrlProvider {
    return function (ctx: MigrationContext, slug: string, _original: string): LiveUrlProviderResult {
        const filename = 'index.html';
        const split = splitDirname(ctx, section, slug);
        const dirname = `/${groupName}/${section}/${sourceName}/${split}/${fileType}/`;
        const lastDot = filename.lastIndexOf('.');
        const front = (lastDot < 0) ? filename : filename.substring(0, lastDot);
        const extension = (lastDot < 0) ? '' : filename.substring(lastDot).toLowerCase();
        return {
            host,
            dirname,
            front,
            extension
        }
    }
}

/**
 * create a url provider for a core archive file.
 * @param downloadsHost upstream host where the archive lives.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param suffix used to create the full name. e.g. '.zip'
 * @param filename main name used for the archive.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns
 */
function getCoreArchiveUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    suffix: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): SlugUrlProvider {
    return function (ctx: MigrationContext, release: string): UrlProviderResult {
        const split = splitDirname(ctx, section, release);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/${filename}-${release}${suffix}`;
        const upstream = `https://${downloadsHost}/release/${filename}-${release}${suffix}`;
        return bindHost(ctx, host, relative, upstream, true);
    }
}

/**
 * create a list of url providers for all the main archive files of a release.
 * @param suffixes list of suffixes to be used for the archive files.
 * @param downloadsHost upstream host where the archive lives.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param filename main name used for the archive.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns list of higher-order functions that depend upon the release id.
 */
function getCoreArchiveListUrlProvider(
    suffixes: Array<string>,
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): Array<SlugUrlProvider> {
    return suffixes.map((suffix) => getCoreArchiveUrlProvider(downloadsHost, host, section, sourceName, suffix, filename, groupName));
}


/**
 * create a url provider for the core l10n zip file.
 * @param downloadsHost upstream host where the archive lives.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher order function that depends upon the locale version and locale, the release is also provided.
 */
function getCoreL10nArchiveUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    groupName: string = 'read-only'
): VersionLocaleVersionUrlProvider {
    return function (ctx: MigrationContext, _release: string, localeVersion: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, localeVersion);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/l10n/${locale}.zip`;
        // translation/core/5.8-beta/af.zip
        const upstream = `https://${downloadsHost}/translation/core/${localeVersion}/${locale}.zip`;
        return bindHost(ctx, host, relative, upstream, true);
    }
}

/**
 * create a url provider for one of the core l10n specific release files.
 * @param downloadsHost upstream host where the archive lives.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param suffix used to create the full name. e.g. '.zip'
 * @param filename main name used for the archive.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns higher-order function that depends upon the release, the locale and the locale version.
 */
function getCoreL10nArchiveItemUrlProvider(
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    suffix: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): VersionLocaleVersionUrlProvider {
    return function (ctx: MigrationContext, release: string, localeVersion: string, locale: string): UrlProviderResult {
        const split = splitDirname(ctx, section, localeVersion);
        const relative = `/${groupName}/${section}/${sourceName}/${split}/l10n/${locale}/${filename}-${release}${suffix}`;
        const upstream = `https://${downloadsHost}/release/${locale}/${filename}-${release}${suffix}`;
        return bindHost(ctx, host, relative, upstream, true);
    }
}

/**
 * create a list of url providers for the core l10n specific release files.
 * @param suffixes list of suffixes to add to the base filename.
 * @param downloadsHost upstream host where the archive lives.
 * @param host which host holds the content.
 * @param section group of data: core, plugins, themes.
 * @param sourceName name of the upstream source.
 * @param filename main name used for the archive.
 * @param groupName role the data plays: meta, read-only, live, stats.
 * @returns list of higher-order functions that depends upon the release, the locale and the locale version.
 */
function getCoreL10nArchiveListUrlProvider(
    suffixes: Array<string>,
    downloadsHost: string,
    host: ContentHostType,
    section: ArchiveGroupName,
    sourceName: string,
    filename: string = 'wordpress',
    groupName: string = 'read-only'
): Array<VersionLocaleVersionUrlProvider> {
    return suffixes.map((suffix) =>
        getCoreL10nArchiveItemUrlProvider(downloadsHost, host, section, sourceName, suffix, filename, groupName));
}


/**
 * default value for the downloads host's base directory.
 */
const DEFAULT_DOWNLOADS_BASE_DIRECTORY = './build';

/**
 * effective value for the downloads host's base directory.
 */
const DOWNLOADS_BASE_DIRECTORY = Deno.env.get('B2PP_DOWNLOADS_BASE_DIRECTORY') ?? DEFAULT_DOWNLOADS_BASE_DIRECTORY;

/**
 * upstream name of the downloads host.
 */
const DOWNLOADS_HOST = 'downloads.wordpress.org';

/**
 * default function definition for a factory function that returns a
 * `StandardsLocations` object.
 * The `StandardLocations` object is the configuration of the layout of
 * resources across an arbitrary number of hosts.
 * It describes the locations for a single upstream source with an arbitrary name.
 * At this point, we only have one upstream source, but this may change if a
 * set of federated repositories emerge.
 */
export default function getStandardLocations(sourceName: string = 'legacy'): StandardLocations {
    return {
        apiHost: 'api.wordpress.org',
        downloadsHost: DOWNLOADS_HOST,
        ctx: {
            sourceName,
            hosts: {
                api: {
                    baseUrl: 'https://api.b2again.org/'
                },
                downloads: {
                    baseUrl: 'https://downloads.b2again.org/',
                    baseDirectory: DOWNLOADS_BASE_DIRECTORY
                },
                support: {
                    baseUrl: 'https://support.b2again.org/'
                },
                www: {
                    baseUrl: 'https://www.b2again.org/'
                }
            },
            prefixLengths: {
                core: 0,
                plugins: 2,
                themes: 2
            },
            nonAsciiPrefixSuffix: '+',
            liveMiddleLength: 20
        },
        releases: getCommonProvider('downloads', 'core', sourceName, 'releases.json'),
        legacyReleases: getCommonProvider('downloads', 'core', sourceName, `${sourceName}-releases.json`),
        // interestingReleases -- default to all releases
        // interestingLocales -- default to all locales
        pluginSlugs: {
            defaults: getCommonProvider('downloads', 'plugins', sourceName, `defaults-list.json`),
            effective: getCommonProvider('downloads', 'plugins', sourceName, `effective-list.json`),
            featured: getCommonProvider('downloads', 'plugins', sourceName, `featured-list.json`),
            interesting: undefined,
            new: getCommonProvider('downloads', 'plugins', sourceName, `new-list.json`),
            popular: getCommonProvider('downloads', 'plugins', sourceName, `popular-list.json`),
            rejected: undefined,
            updated: getCommonProvider('downloads', 'plugins', sourceName, `updated-list.json`)
        },
        themeSlugs: {
            defaults: getCommonProvider('downloads', 'themes', sourceName, `defaults-list.json`),
            effective: getCommonProvider('downloads', 'themes', sourceName, `effective-list.json`),
            featured: getCommonProvider('downloads', 'themes', sourceName, `featured-list.json`),
            interesting: undefined,
            new: getCommonProvider('downloads', 'themes', sourceName, `new-list.json`),
            popular: getCommonProvider('downloads', 'themes', sourceName, `popular-list.json`),
            rejected: undefined,
            updated: getCommonProvider('downloads', 'themes', sourceName, `updated-list.json`)
        },

        coreTranslationV1_0: getFilenameSlugProvider('downloads', 'core', sourceName, 'translations-1.0.json'),
        legacyCoreTranslationV1_0: getFilenameSlugProvider('downloads', 'core', sourceName, `${sourceName}-translations-1.0.json`),

        coreChecksumsV1_0: getFilenameLocaleSlugProvider('downloads', 'core', sourceName, 'checksums-1.0.json'),
        coreCreditsV1_1: getFilenameLocaleSlugProvider('downloads', 'core', sourceName, 'credits-1.1.json'),
        coreImportersV1_1: getFilenameLocaleSlugProvider('downloads', 'core', sourceName, 'importers-1.1.json'),

        coreL10nZip: getCoreL10nArchiveUrlProvider(DOWNLOADS_HOST, 'downloads', 'core', sourceName),
        coreL10nZips: getCoreL10nArchiveListUrlProvider(
            [
                '.zip',
                '.zip.md5',
                '.zip.sha1',
                '.tar.gz',
                '.tar.gz.md5',
                '.tar.gz.sha1',
            ],
            DOWNLOADS_HOST, 'downloads', 'core', sourceName
        ),
        coreZips: getCoreArchiveListUrlProvider(
            [
                '.zip',
                '.zip.md5',
                '.zip.sha1',
                '.tar.gz',
                '.tar.gz.md5',
                '.tar.gz.sha1',
                '-no-content.zip',
                '-no-content.zip.md5',
                '-no-content.zip.sha1',
                '-new-bundled.zip',
                '-new-bundled.zip.md5',
                '-new-bundled.zip.sha1',
            ],
            DOWNLOADS_HOST, 'downloads', 'core', sourceName
        ),

        coreStatusFilename: getFilenameSlugProvider('downloads', 'core', sourceName, 'release-status.json'),

        pluginSummary: getCommonProvider('downloads', 'plugins', sourceName, `plugins/summary.json`),
        pluginFilename: getFilenameSlugProvider('downloads', 'plugins', sourceName, 'plugins', 'plugin.json'),
        legacyPluginFilename: getFilenameSlugProvider('downloads', 'plugins', sourceName, `${sourceName}-plugin.json`),
        pluginStatusFilename: getFilenameSlugProvider('downloads', 'plugins', sourceName, 'plugin-status.json'),
        pluginTranslationV1_0: getFilenameSlugVersionProvider('downloads', 'plugins', sourceName, 'translations-1.0.json'),
        legacyPluginTranslationV1_0: getFilenameSlugVersionProvider('downloads', 'plugins', sourceName, `${sourceName}-translations-1.0.json`),
        pluginZip: getSlugVersionOriginalUrlProvider('downloads', 'plugins', sourceName),
        pluginL10nZip: getSlugVersionLocaleUrlProvider(DOWNLOADS_HOST, 'downloads', 'plugins', sourceName),
        pluginSupport: getSlugUrlProvider('support', 'plugins', sourceName, 'support'),
        pluginHomepage: getSlugUrlProvider('support', 'plugins', sourceName, 'homepages'),
        pluginScreenshot: getSlugOriginalLiveUrlProvider('downloads', 'plugins', sourceName, 'screenshots'),
        pluginBanner: getSlugOriginalLiveUrlProvider('downloads', 'plugins', sourceName, 'banners'),
        pluginPreview: getSlugLiveIndexUrlProvider('downloads', 'plugins', sourceName, 'preview'),

        themeSummary: getCommonProvider('downloads', 'themes', sourceName, `summary.json`),
        themeFilename: getFilenameSlugProvider('downloads', 'themes', sourceName, 'theme.json'),
        legacyThemeFilename: getFilenameSlugProvider('downloads', 'themes', sourceName, `${sourceName}-theme.json`),
        themeStatusFilename: getFilenameSlugProvider('downloads', 'themes', sourceName, 'theme-status.json'),
        themeTranslationV1_0: getFilenameSlugVersionProvider('downloads', 'themes', sourceName, 'translations-1.0.json'),
        legacyThemeTranslationV1_0: getFilenameSlugVersionProvider('downloads', 'themes', sourceName, `${sourceName}-translations-1.0.json`),
        themeZip: getSlugVersionOriginalUrlProvider('downloads', 'themes', sourceName),
        themeL10nZip: getSlugVersionLocaleUrlProvider(DOWNLOADS_HOST, 'downloads', 'themes', sourceName),
        themeHomepage: getSlugUrlProvider('support', 'themes', sourceName, 'homepages'),
        themeScreenshot: getSlugOriginalLiveUrlProvider('downloads', 'themes', sourceName, 'screenshots'),
        themePreview: getSlugLiveIndexUrlProvider('downloads', 'themes', sourceName, 'preview'),
        themeReviews: getSlugUrlProvider('support', 'themes', sourceName, 'reviews'),
    }
}
