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

import { ThemeAuthor, ThemeDetails, ThemeParent, TranslationsResultV1_0 } from "../../lib/api.ts";
import { migrateStructure, MigrationStructureProvider } from "../../lib/migration.ts";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import { LiveUrlProviderResult, MigrationContext, StandardLocations, UrlProviderResult } from "../../lib/standards.ts";
import { RequestGroup } from "../pluperfect.ts";
import { filterTranslations, getTranslationMigration } from "./core.ts";
import { downloadMetaLegacyJson } from "./downloads.ts";
import { CommandOptions } from "./options.ts";


// function getBasename(url: string): string {
//     return url.substring(url.lastIndexOf('/')+1);
// }

// function getHomepageUrl(supportBaseUrl: string, slug: string): string {
//     return new URL(`/homepages/themes/legacy/${slug}/`, supportBaseUrl).toString();
// }

// function getReviewUrl(supportBaseUrl: string, slug: string): string {
//     return new URL(`/reviews/themes/legacy/${slug}/`, supportBaseUrl).toString();
// }

// function getScreenshotUrl(downloadsBaseUrl: string, split: string, url: string): string {
//     const screenshot = getBasename(url);
//     return new URL(`/themes/live/legacy/${split}/screenshots/${screenshot}`, downloadsBaseUrl).toString();
// }

// function getZipUrl(downloadsBaseUrl: string, split: string, existing: string, version?: string): string {
//     const filename = getBasename(existing);
//     if (version) {
//         return new URL(`/themes/read-only/legacy/${split}/${version}/${filename}`, downloadsBaseUrl).toString();
//     }
//     return new URL(`/themes/read-only/legacy/${split}/${filename}`, downloadsBaseUrl).toString();
// }

// function isWordpressOrg(url: string): boolean {
//     return url.toLowerCase().startsWith('https://wordpress.org/');
// }

// export function migrateThemeInfo(downloadsBaseUrl: string,
//                                  supportBaseUrl: string,
//                                  split: string,
//                                  input: ThemeInfo,
//                                  fromAPI: ThemeInfo): ThemeInfo {

//     const kleen = structuredClone(input); //{ ...input };
//     if ((typeof kleen.author === 'string') && (kleen.author.indexOf('@') < 0)) {
//         kleen.author = `${kleen.author}@wordpress.org`;
//     } else if ((typeof kleen.author === 'object') &&
//                (kleen.author.user_nicename && (kleen.author.user_nicename.indexOf('@') < 0))) {
//         kleen.author.user_nicename = `${kleen.author.user_nicename}@wordpress.org`;
//     }
//     kleen.preview_url = new URL(`/plugins/live/legacy/${split}/preview/index.html`, downloadsBaseUrl).toString();
//     if (kleen.screenshot_url) {
//         kleen.screenshot_url = getScreenshotUrl(downloadsBaseUrl, split, kleen.screenshot_url);
//     }
//     if (kleen.download_link) {
//         if (kleen.version) {
//             kleen.download_link = getZipUrl(downloadsBaseUrl, split, kleen.download_link, kleen.version);
//         } else {
//             kleen.download_link = getZipUrl(downloadsBaseUrl, split, kleen.download_link);
//         }
//     }
//     if (kleen.reviews_url && kleen.slug && isWordpressOrg(kleen.reviews_url)) {
//         kleen.reviews_url = getReviewUrl(supportBaseUrl, kleen.slug);
//     }
//     if (kleen.homepage && kleen.slug && isWordpressOrg(kleen.homepage)) {
//         kleen.homepage = getHomepageUrl(supportBaseUrl, kleen.slug);
//     }
//     if (kleen.versions) {
//         // kleen is a shallow copy, deepen it before we mutate it
//         kleen.versions = { ...kleen.versions };
//         for (const version in kleen.versions) {
//             kleen.versions[version] = getZipUrl(downloadsBaseUrl, split, kleen.versions[version], version);
//         }
//     }
//     if (typeof kleen.description === 'string') {
//         if (!kleen.sections) {
//             kleen.sections = { description: kleen.description };
//             kleen.description = undefined;
//         } else if (kleen.sections?.description === kleen.description) {
//             kleen.description = undefined;
//         } else if (typeof kleen.sections?.description !== 'string') {
//             // deepen copy before mutation
//             kleen.sections = { ...kleen.sections };
//             kleen.sections.description = kleen.description;
//         }
//     } else if (typeof fromAPI.description === 'string') {
//         if (!kleen.sections) {
//             kleen.sections = { description: fromAPI.description };
//         } else if (typeof kleen.sections?.description !== 'string') {
//             // deepen copy before mutation
//             kleen.sections = { ...kleen.sections };
//             kleen.sections.description = fromAPI.description;
//         }
//     }
//     if (kleen.parent) {
//         kleen.parent = { ... kleen.parent };
//     } else if (fromAPI.parent) {
//         kleen.parent = { ...fromAPI.parent };
//     }
//     if (kleen.parent && typeof kleen?.parent?.slug === 'string') {
//         kleen.parent.homepage = getHomepageUrl(supportBaseUrl, kleen.parent.slug);
//     }
//     if (!kleen.template && fromAPI.template) {
//         kleen.template = fromAPI.template;
//     }
//     kleen.rating = 0;
//     kleen.ratings = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
//     kleen.num_ratings = 0;
//     kleen.active_installs = 0;
//     kleen.downloaded = 0;
//     return kleen;
// }



// /**
//  * Query the api to determine which translations/locales are supported for each
//  * version of a theme. These files are then downloaded.
//  * @param options command-line options.
//  * @param slug unique identifier for the theme.
//  * @param split directory split.
//  * @param themeMetaDir where the theme specific meta data starts
//  * @param themeReadOnlyDir top of tree of theme zip files
//  * @param releaseId unique identifier for the release, e.g. '6.2.2'
//  * @returns list of information about downloaded files.
//  */
// async function processThemeTranslations(
//     options: CommandOptions,
//     slug: string,
//     split: string,
//     themeMetaDir: string,
//     themeReadOnlyDir: string,
//     releaseId: string
// ): Promise<Array<DownloadFileInfo>> {
//     const releaseMetaDir = path.join(themeMetaDir, releaseId)
//     vreporter(`> mkdir -p ${releaseMetaDir}`);
//     await Deno.mkdir(releaseMetaDir, { recursive: true });

//     const url = new URL(`/translations/themes/1.0/`, `https://${options.apiHost}`);
//     url.searchParams.append('slug', slug)
//     url.searchParams.append('version', releaseId);

//     const files: Array<DownloadFileInfo> = [];
//     const o = await downloadMetaLegacyJson(reporter, releaseMetaDir, 'translations.json',
//             url, options.force, options.jsonSpaces,
//             getMigrateThemeTranslation(options, split, releaseId));

//     if (o && (typeof o === 'object') && ('translations' in o) && Array.isArray(o.translations)) {
//         const translations: Array<ThemeTranslationEntry> = o.translations;
//         const releaseReadOnlyL10nDir = path.join(themeReadOnlyDir, releaseId, 'l10n');
//         vreporter(`> mkdir -p ${releaseReadOnlyL10nDir}`);
//         await Deno.mkdir(releaseReadOnlyL10nDir, { recursive: true });
//         for (const t of translations) {
//             const info = await downloadZip(reporter, t.package, releaseReadOnlyL10nDir, options.force, options.rehash);
//             files.push(info);
//         }
//     }

//     return files;
// }

function getLiveUrlFromProvider(ctx: MigrationContext, p: LiveUrlProviderResult): string {
    if (!ctx.hosts[p.host]) {
        throw new Deno.errors.NotSupported(`host ${p.host} is not defined in ctx`);
    }
    return new URL(`${p.dirname}/${p.front}${p.extension}`, ctx.hosts[p.host].baseUrl).toString();
}


function getUrlFromProvider(ctx: MigrationContext, p: UrlProviderResult): string {
    if (!p.host || !ctx.hosts[p.host] || !p.pathname) {
        throw new Deno.errors.NotSupported(`host ${p.host} is not defined in ctx`);
    }
    return new URL(p.pathname, ctx.hosts[p.host].baseUrl).toString();
}

function migrateAuthor(author: unknown): string | ThemeAuthor {
    if (typeof author === 'string') {
        if (author.indexOf('@') < 0) {
            return `${author}@wordpress.org`;
        }
        return author;
    }
    if (author &&
        (typeof author === 'object') &&
        ('user_nicename' in author) &&
        (typeof author.user_nicename === 'string') &&
        (author.user_nicename.indexOf('@') < 0)) {
        const updated: ThemeAuthor = structuredClone(author) as ThemeAuthor;
        updated.user_nicename = `${author.user_nicename}@wordpress.org`;
        return updated;
    }
    return author as ThemeAuthor;
}

function migrateRatings(ratings: Record<string, number>): Record<string, number> {
    const updated = ratings;
    for (const n in ratings) {
        updated[n] = 0;
    }
    return updated;
}

function migrateParent(locations: StandardLocations, slug: string, parent: ThemeParent): ThemeParent {
    const migrated = { ... parent };
    if (parent.homepage) {
        migrated.homepage = getUrlFromProvider(locations.ctx, locations.themeHomepage(locations.ctx, slug, parent.homepage));
    }
    return parent;
}

function migrateSections(sections: Record<string, string>): Record<string, string> {
    const updated: Record<string, undefined | string> = { ... sections };
    updated.reviews = undefined;
    return updated as Record<string, string>;
}

function migrateVersions(
    locations: StandardLocations,
    slug: string,
    versions: Record<string, string>
): Record<string, string> {
    const migrated: Record<string, string> = {};
    for (const version in versions) {
        const url = getUrlFromProvider(locations.ctx, locations.themeZip(locations.ctx, slug, version, versions[version]))
        migrated[version] = url;
    }
    return migrated;
}

function getThemeMigratorProvider(
    locations: StandardLocations,
    slug: string,
    version: string,
): MigrationStructureProvider<ThemeDetails> {
    const preview_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, locations.themePreview(ctx, slug, `${url}`));
    const screenshot_url = (ctx: MigrationContext, url: unknown) =>
        getLiveUrlFromProvider(ctx, locations.themeScreenshot(ctx, slug, `${url}`));
    const author = (_ctx: MigrationContext, author: unknown) =>
        migrateAuthor(author);
    const ratings = (_ctx: MigrationContext, ratings: unknown) =>
        migrateRatings(ratings as Record<string, number>);
    const zero = (_ctx: MigrationContext, _zeroed: unknown) => 0;
    const parent = (_ctx: MigrationContext, parent: unknown) =>
        migrateParent(locations, slug, parent as ThemeParent);
    const download_link = (ctx: MigrationContext, download_link: unknown) =>
        getUrlFromProvider(ctx, locations.themeZip(ctx, slug, version, download_link as string));
    const homepage = (ctx: MigrationContext, homepage: unknown) =>
        getUrlFromProvider(ctx, locations.themeHomepage(ctx, slug, homepage as string));
    const versions = (_ctx: MigrationContext, versions: unknown) =>
        migrateVersions(locations, slug, versions as Record<string, string>);
    const sections = (_ctx: MigrationContext, sections: unknown) =>
        migrateSections(sections as Record<string, string>);
    const reviews_url = (ctx: MigrationContext, reviews_url: unknown) =>
        getUrlFromProvider(ctx, locations.themeReviews(ctx, slug, reviews_url as string));
    return {
        preview_url,
        author,
        screenshot_url,
        ratings,
        rating: zero,
        num_ratings: zero,
        downloaded: zero,
        active_installs: zero,
        parent,
        download_link,
        homepage,
        versions,
        sections,
        reviews_url,
    };
}

function getThemeMigrator(
    locations: StandardLocations,
    slug: string,
): (original: ThemeDetails) => ThemeDetails {
    return function (original: ThemeDetails): ThemeDetails {
        if (!original.version) {
            throw new Deno.errors.NotSupported(`theme.version is not defined`);
        }
        const provider = getThemeMigratorProvider(locations, slug, original.version);
        const migrated = migrateStructure(provider, locations.ctx, original);
        // FIXME: handle cross-field migration (urls in text fields)
        return migrated;
    }
}

/**
 * Handle the downloading and processing of a single theme.
 * @param reporter how to log non-error information.
 * @param jreporter JSON structured logger.
 * @param host host where the files live.
 * @param options command-line options.
 * @param locations how to access resources.
 * @param slug theme slug.
 * @returns
 */
export async function createThemeRequestGroup(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    options: CommandOptions,
    locations: StandardLocations,
    locales: ReadonlyArray<string>,
    slug: string,
): Promise<RequestGroup> {

    // the theme list query does not return a useful timestamp, so we have to
    // download the individual theme files just to see if anything has changed.

    const themeFilename = locations.themeFilename(locations.ctx, slug);
    const legacyThemeFilename = locations.legacyThemeFilename(locations.ctx, slug);
    const url = getThemeInfoUrl(locations.apiHost, slug);
    if (!legacyThemeFilename.pathname || !themeFilename.pathname || !legacyThemeFilename.host) {
        throw new Deno.errors.NotSupported(`legacyThemeFilename and themeFilename must define pathnames`);
    }
    const [ themeInfo, _migratedTheme ] = await downloadMetaLegacyJson(reporter, jreporter, legacyThemeFilename.host,
        legacyThemeFilename.pathname, themeFilename.pathname, url, true, options.jsonSpaces,
        getThemeMigrator(locations, slug));

    const group: RequestGroup = {
        sourceName: locations.ctx.sourceName,
        section: 'themes',
        slug: slug,
        statusFilename: locations.themeStatusFilename(locations.ctx, slug),
        requests: [],
        liveRequests: []
    };
    if (typeof themeInfo.error === 'string') {
        group.error = themeInfo.error;
        return group;
    }
    if ((typeof themeInfo.slug !== 'string') || (themeInfo.slug !== slug)) {
        group.error = `theme file slug:${themeInfo.slug} does not match slug ${slug}`;
        return group;
    }
    if ((typeof themeInfo.download_link !== 'string') || (themeInfo.download_link === '')) {
        group.error = `theme file ${slug} does not have a valid download_link`;
        return group;
    }

    if (themeInfo.versions) {
        for (const version in themeInfo.versions) {
            group.requests.push(locations.themeZip(locations.ctx, slug, version, themeInfo.versions[version]));
            const translations = locations.themeTranslationV1_0(locations.ctx, slug, version);
            const legacyTranslations = locations.legacyThemeTranslationV1_0(locations.ctx, slug, version);
            if (!legacyTranslations.pathname || !translations.pathname) {
                throw new Deno.errors.NotSupported(`legacyThemeTranslationV1_0 and themeTranslationV1_0 must define pathnames`);
            }
            group.requests.push(translations, legacyTranslations);
            // since themes timestamps are largely absent, we always reload the current version's translations
            const outdated = ((typeof themeInfo.version === 'string') && (themeInfo.version === version));
            const details = await getThemeTranslations(reporter, jreporter, locations, options, slug, version, outdated, locales);
            if (details && Array.isArray(details.translations) && (details.translations.length > 0)) {
                for (const item of details.translations) {
                    if (item.version === version) {
                        group.requests.push(locations.themeL10nZip(locations.ctx, slug, version, item.language));
                    }
                }
            }
        }
    } else if (themeInfo.version && themeInfo.download_link) {
        group.requests.push(locations.themeZip(locations.ctx, slug, themeInfo.version, themeInfo.download_link));
    }
    if (themeInfo.preview_url) {
        group.liveRequests.push(locations.themePreview(locations.ctx, slug, themeInfo.preview_url));
    }
    if (themeInfo.screenshot_url) {
        // some ts.w.org URL's don't have a scheme?
        if (themeInfo.screenshot_url.startsWith('//')) {
            group.liveRequests.push(locations.themeScreenshot(locations.ctx, slug, `https:${themeInfo.screenshot_url}`));
        } else {
            group.liveRequests.push(locations.themeScreenshot(locations.ctx, slug, themeInfo.screenshot_url));
        }
    }

    return group;
}


async function getThemeTranslations(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    options: CommandOptions,
    slug: string,
    version: string,
    outdated: boolean,
    locales: ReadonlyArray<string>
): Promise<TranslationsResultV1_0> {
    const apiUrl = new URL(`/translations/themes/1.0/`, `https://${locations.apiHost}/`);
    apiUrl.searchParams.append('slug', slug);
    apiUrl.searchParams.append('version', version);

    const migratedJson = locations.themeTranslationV1_0(locations.ctx, slug, version);
    const legacyJson = locations.legacyThemeTranslationV1_0(locations.ctx, slug, version);
    if (!migratedJson.host || !migratedJson.pathname || !legacyJson.pathname) {
        throw new Deno.errors.NotSupported(`themeTranslationV1_0 location and legacyThemeTranslationV1_0 are misconfigured.`);
    }
    const migrator = getTranslationMigration(locations.themeL10nZip, locations.ctx, slug);
    const [ originalTranslations, migratedTranslations ] = await downloadMetaLegacyJson(reporter, jreporter, migratedJson.host,
        legacyJson.pathname, migratedJson.pathname, apiUrl, options.force || outdated,
        options.jsonSpaces, migrator);
    const originals = originalTranslations as unknown as TranslationsResultV1_0;
    const migrated = migratedTranslations as unknown as TranslationsResultV1_0;
    if (locales.length > 0) {
        // we need to filter the locales to the ones that are "interesting"
        return await filterTranslations(originals, migrated, locales,
            legacyJson.pathname, migratedJson.pathname, options.jsonSpaces);
    }
    return originals;
}

//     const infoUrl = getThemeInfoUrl(options.apiHost, slug);
//     let ok = true;
//     let last_updated_time;
//     try {
//         vreporter(`> mkdir -p ${themeReadOnlyDir}`);
//         await Deno.mkdir(themeReadOnlyDir, { recursive: true });
//         vreporter(`> mkdir -p ${themeMetaDir}`);
//         await Deno.mkdir(themeMetaDir, { recursive: true });

//         const [ themeInfo, migratedTheme ] = await handleThemeInfo(options, themeMetaDir, infoUrl, split, outdated || options.force, fromAPI);
//         if (themeInfo) {
//             if ((typeof themeInfo.slug !== 'string') ||
//                 (typeof themeInfo.error === 'string') ||
//                 (typeof themeInfo.download_link !== 'string')) {
//                 ok = false;
//             } else {
//                 last_updated_time = themeInfo.last_updated_time;
//                 let fileInfo;
//                 if (themeInfo.version) {
//                     const releaseReadOnlyDir = path.join(themeReadOnlyDir, themeInfo.version);
//                     vreporter(`> mkdir -p ${releaseReadOnlyDir}`);
//                     await Deno.mkdir(releaseReadOnlyDir, { recursive: true });
//                     fileInfo = await downloadZip(reporter, themeInfo.download_link, releaseReadOnlyDir, options.force, options.rehash);
//                 } else {
//                     fileInfo = await downloadZip(reporter, themeInfo.download_link, themeReadOnlyDir, options.force, options.rehash);
//                 }
//                 ok = ok && (fileInfo.status === 'full');
//                 files[fileInfo.filename] = fileInfo;
//                 if (options.full || options.live) {
//                     let changed = false;
//                     if ((typeof themeInfo.preview_url === 'string') && (typeof migratedTheme.preview_url === 'string')) {
//                         // preview_url
//                         const previewDir = path.join(themeLiveDir, 'preview');
//                         vreporter(`> mkdir -p ${previewDir}`);
//                         await Deno.mkdir(previewDir, { recursive: true });
//                         const previewUrl = new URL(themeInfo.preview_url);
//                         const previewInfo = await downloadLiveFile(reporter, previewUrl, previewDir, 'index.html', options.hashLength);
//                         ok = ok && (previewInfo.status === 'full');
//                         files[previewInfo.filename] = previewInfo;
//                         migratedTheme.preview_url = `${options.downloadsBaseUrl}${previewInfo.filename.substring(options.documentRoot.length+1)}`;
//                         changed = true;
//                     }
//                     if (typeof themeInfo.screenshot_url === 'string') {
//                         // screenshot_url
//                         const screenshotsDir = path.join(themeLiveDir, 'screenshots');
//                         vreporter(`> mkdir -p ${screenshotsDir}`);
//                         await Deno.mkdir(screenshotsDir, { recursive: true });
//                         // some ts.w.org URL's don't have a scheme?
//                         const screenshotUrl = new URL(themeInfo.screenshot_url.startsWith('//') ? `https:${themeInfo.screenshot_url}` : themeInfo.screenshot_url);
//                         const screenshotInfo = await downloadLiveFile(reporter, screenshotUrl, screenshotsDir, path.basename(screenshotUrl.pathname), options.hashLength);
//                         ok = ok && (screenshotInfo.status === 'full');
//                         files[screenshotInfo.filename] = screenshotInfo;
//                         migratedTheme.screenshot_url = `${options.downloadsBaseUrl}${screenshotInfo.filename.substring(options.documentRoot.length+1)}`;
//                         changed = true;
//                     }
//                     if (changed) {
//                         await saveThemeInfo(options, themeMetaDir, migratedTheme);
//                     }
//                 }
//                 if (options.full || options.zips) {
//                     if (typeof themeInfo.versions === 'object') {
//                         for (const version in themeInfo.versions) {
//                             if (version !== 'trunk') {
//                                 const releaseReadOnlyDir = path.join(themeReadOnlyDir, version);
//                                 vreporter(`> mkdir -p ${releaseReadOnlyDir}`);
//                                 await Deno.mkdir(releaseReadOnlyDir, { recursive: true });
//                                 if (version !== themeInfo.version) { // we have already dl the main zip,
//                                     const fileInfo = await downloadZip(reporter, themeInfo.versions[version], releaseReadOnlyDir, options.force, options.rehash);
//                                     files[fileInfo.filename] = fileInfo;
//                                     ok = ok && (fileInfo.status === 'full');
//                                 }
//                                 const l10n = await processThemeTranslations(options, slug, split, themeMetaDir, themeReadOnlyDir, version);
//                                 for (const item of l10n) {
//                                     files[item.filename] = item;
//                                     ok = ok && (item.status === 'full');
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }
//         }
//     } catch (_) {
//         console.error(`Exception: ${_}`);
//         ok= false;
//     }

//     return {
//         status: ok ? (options.full ? 'full' : 'partial') : 'failed',
//         when: Date.now(),
//         files,
//         last_updated_time
//     };
// }

/**
 * Determine the URL to use to request theme information.
 * @param apiHost where the API is.
 * @param name slug used to access the theme.
 * @returns
 */
function getThemeInfoUrl(apiHost: string, name: string): URL {
    const url = new URL('/themes/info/1.2/', `https://${apiHost}`);
    url.searchParams.append('action', 'theme_information');
    url.searchParams.append('slug', name);
    url.searchParams.append('fields[]','description');
    url.searchParams.append('fields[]','versions');
    url.searchParams.append('fields[]','ratings');
    url.searchParams.append('fields[]','active_installs');
    url.searchParams.append('fields[]','sections');
    url.searchParams.append('fields[]','parent');
    url.searchParams.append('fields[]','template');
    return url;
}

// /**
//  * Download the theme information JSON file, if necessary. The download
//  * may be forced by setting the force parameter. If the file does not
//  * exist, we will attempt to download the file.
//  * @param themeDir where to put the json file.
//  * @param infoUrl where to get the json file.
//  * @param force if true, remove any old file first.
//  * @returns
//  */
// async function handleThemeInfo(
//     options: CommandOptions,
//     themeMetaDir: string,
//     infoUrl: URL,
//     split: string,
//     force: boolean,
//     fromAPI: ThemeInfo
// ): Promise<Array<ThemeDownloadResult>> {
//     const themeJson = path.join(themeMetaDir, 'theme.json');
//     const legacyThemeJson = path.join(themeMetaDir, 'legacy-theme.json');
//     try {
//         if (force) {
//             await Deno.remove(themeJson, { recursive: true });
//             await Deno.remove(legacyThemeJson, { recursive: true });
//         }
//         const legacyContents = await Deno.readTextFile(legacyThemeJson);
//         const legacyObj = JSON.parse(legacyContents);
//         const migratedContents = await Deno.readTextFile(themeJson);
//         const migratedObj = JSON.parse(migratedContents);
//         return [ legacyObj, migratedObj ];
//     } catch (_) {
//         reporter(`fetch(${infoUrl}) > ${legacyThemeJson}`);
//         const response = await fetch(infoUrl);
//         if (!response.ok) {
//             const error = `${response.status} ${response.statusText}`;
//             reporter(`fetch failed: ${error}`);
//             return [{ error }, { error }];
//         }
//         const json = await response.json();
//         const rawText = JSON.stringify(json, null, options.jsonSpaces);
//         const migrated = migrateThemeInfo(options.downloadsBaseUrl, options.supportBaseUrl, split, json, fromAPI);
//         await saveThemeInfo(options, themeMetaDir, migrated);
//         await Deno.writeTextFile(legacyThemeJson, rawText);
//         return [ json, migrated ];
//     }
// }

// /**
//  * Persist theme information.
//  * @param options command-line options.
//  * @param themeMetaDir where meta data is to be stored.
//  * @param info information about a theme.
//  */
// async function saveThemeInfo(
//     options: CommandOptions,
//     themeMetaDir: string,
//     info: ThemeInfo
// ): Promise<void> {
//     const themeJson = path.join(themeMetaDir, 'theme.json');
//     const text = JSON.stringify(info, null, options.jsonSpaces);
//     await Deno.writeTextFile(themeJson, text);
// }

// /**
//  * Download all of the theme files.
//  * @param options command-line options.
//  * @param prefixLength number of characters in prefix of split filename.
//  * @param themeSlugs list of plugin slugs.
//  */
// async function downloadFiles(options: CommandOptions, prefixLength: number, themeSlugs: Array<string>, themeList: Array<ThemeInfo>): Promise<void> {
//     const statusFilename = path.join(options.documentRoot, 'themes', 'meta', options.statusFilename);
//     const status = await readDownloadStatus(statusFilename, themeSlugs);
//     let ok: boolean = true;
//     let soFar: number = 0;
//     let success: number = 0;
//     let failure: number = 0;
//     let skipped: number = 0;
//     let needed: boolean = false;
//     let outdated: boolean = false;
//     let changed: boolean = false;
//     let pace: number = parseInt(options.pace);
//     if (isNaN(pace)) {
//         pace = DEFAULT_PACE;
//         console.error(`Warning: unable to parse ${options.pace} as an integer. default ${pace} is used`);
//     }
//     // go through and mark themes for which we are no longer interested.
//     for (const slug in status.map) {
//         if (!themeSlugs.includes(slug)) {
//             status.map[slug].status = 'uninteresting';
//         }
//     }
//     for (const item of themeList) {
//         if (typeof item.slug !== 'string') {
//             continue;
//         }
//         const slug = item.slug;
//         needed = false;
//         outdated = false;
//         if (typeof status.map[slug] !== 'object') {
//             status.map[slug] = { status: 'unknown', when: 0, files: {} };
//         }
//         if ((typeof status.map[slug] === 'object') &&
//             (typeof status.map[slug]?.status === 'string') &&
//             (typeof status.map[slug]?.when === 'number')) {

//             // check to see if the data we have is out of date.
//             if ((typeof status.map[slug]?.last_updated_time === 'string') &&
//                 (typeof item?.last_updated_time === 'string') &&
//                 (status.map[slug].last_updated_time < item.last_updated_time)) {
//                 status.map[slug].status = 'outdated';
//             }
//             // determine if we need this theme
//             switch (status.map[slug]?.status) {
//                 case 'unknown':
//                     needed = true;
//                     break;
//                 case 'partial':
//                     needed = options.full;
//                     break;
//                 case 'full':
//                 case 'uninteresting':
//                     needed = false;
//                     break;
//                 case 'failed':
//                     needed = options.retry;
//                     break;
//                 case 'outdated':
//                     needed = true;
//                     outdated = true;
//                     break;
//                 default:
//                     console.error(`Error: unrecognized status. slug=${slug}, status=${status.map[slug]?.status}`);
//                     break;
//             }
//             soFar += 1;
//             if (needed || options.force || options.rehash || outdated) {
//                 const themeStatus = await processTheme(options, prefixLength, slug, outdated, item);
//                 if ((themeStatus.status === 'full') || (themeStatus.status === 'partial')) {
//                     success += 1;
//                 } else if (themeStatus.status === 'failed') {
//                     failure += 1;
//                 } else {
//                     console.error(`Warning: unknown status after processTheme: slug=${slug}`);
//                 }
//                 changed = true;
//                 const existing = status.map[slug].files;
//                 status.map[slug].status = themeStatus.status;
//                 status.map[slug].when = themeStatus.when;
//                 status.map[slug].last_updated_time = themeStatus.last_updated_time;
//                 status.map[slug].files = {};
//                 for (const name in themeStatus.files) {
//                     status.map[slug].files[name] = mergeDownloadInfo(existing[name], themeStatus.files[name]);
//                 }
//                 ok = ok && (themeStatus.status !== 'failed');
//             } else {
//                 skipped += 1;
//                 vreporter(`skipped slug: ${slug}`);
//             }
//         } else {
//             console.error(`Error: unknown status: slug=${slug}`);
//         }
//         if ((soFar % pace) == 0) {
//             if (changed) {
//                 reporter(`save status > ${statusFilename}`);
//                 ok = await saveDownloadStatus(statusFilename, status) && ok;
//             }
//             changed = false;
//             vreporter('');
//             reporter(`themes processed:   ${soFar}`);
//             vreporter(`successful:         ${success}`);
//             vreporter(`failures:           ${failure}`);
//             vreporter(`skipped:            ${skipped}`);
//         }
//     }
//     status.when = Date.now();
//     reporter(`save status > ${statusFilename}`);
//     ok = await saveDownloadStatus(statusFilename, status) && ok;

//     reporter(`Total themes processed:   ${soFar}`);
//     reporter(`Total successful:         ${success}`);
//     reporter(`Total failures:           ${failure}`);
//     reporter(`Total skipped:            ${skipped}`);
// }
