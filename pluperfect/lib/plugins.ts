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

import { PluginDetails } from "../../lib/api.ts";

// function getBannerUrl(downloadsBaseUrl: string, split: string, url: string): string {
//     const screenshot = getBasename(url);
//     return new URL(`/plugins/live/legacy/${split}/banners/${screenshot}`, downloadsBaseUrl).toString();
// }

// function getBasename(url: string): string {
//     return url.substring(url.lastIndexOf('/')+1);
// }

// function getHomepageUrl(supportBaseUrl: string, slug: string): string {
//     return new URL(`/homepages/plugins/legacy/${slug}/`, supportBaseUrl).toString();
// }

// function getPreviewUrl(downloadsBaseUrl: string, split: string): string {
//     return new URL(`/plugins/live/legacy/${split}/preview/index.html`, downloadsBaseUrl).toString();
// }

// function getScreenshotUrl(downloadsBaseUrl: string, split: string, url: string): string {
//     const screenshot = getBasename(url);
//     const kleen =  new URL(`/plugins/live/legacy/${split}/screenshots/${screenshot}`, downloadsBaseUrl);
//     kleen.search = '';
//     return kleen.toString();
// }

// function getSupportUrl(supportBaseUrl: string, slug: string): string {
//     return new URL(`/support/plugins/legacy/${slug}/`, supportBaseUrl).toString();
// }

// function getZipUrl(downloadsBaseUrl: string, split: string, existing: string): string {
//     const filename = getBasename(existing);
//     return new URL(`/plugins/read-only/legacy/${split}/${filename}`, downloadsBaseUrl).toString();

// }

// function isWordpressOrg(url: string): boolean {
//     return url.startsWith('https://wordpress.org/') || url.startsWith('http://wordpress.org/');
// }


// /**
//  * Redact content from plugin information.
//  * @param input source plugin information.
//  * @returns plugin information with selected fields redacted/zero'd.
//  */
// export function migratePluginInfo(
//     downloadsBaseUrl: string,
//     supportBaseUrl: string,
//     split: string,
//     input: PluginDetails,
//     _fromAPI: PluginDetails
// ): PluginDetails {
//     const kleen = { ... input};
//     const screenshotMap: Record<string, string> = {};

//     kleen.active_installs = 0;
//     if (kleen.banners && !Array.isArray(kleen.banners)) {
//         kleen.banners = { ...kleen.banners };
//         if (typeof kleen.banners?.high === 'string') {
//             kleen.banners.high = getBannerUrl(downloadsBaseUrl, split, kleen.banners.high);
//         }
//         if (typeof kleen.banners?.low === 'string') {
//             kleen.banners.low = getBannerUrl(downloadsBaseUrl, split, kleen.banners.low);
//         }
//     }
//     if (kleen.download_link) {
//         kleen.download_link = getZipUrl(downloadsBaseUrl, split, kleen.download_link);
//     }
//     if (kleen.homepage && kleen.slug && isWordpressOrg(kleen.homepage)) {
//         kleen.homepage = getHomepageUrl(supportBaseUrl, kleen.slug);
//     }
//     kleen.num_ratings = 0;
//     if (kleen.preview_link) {
//         kleen.preview_link = getPreviewUrl(downloadsBaseUrl, split);
//     }
//     kleen.rating = 0;
//     kleen.ratings = {'1': 0, '2': 0, '3': 0, '4': 0, '5': 0};
//     if (kleen.screenshots) {
//         // kleen is a shallow copy, deepen it before we mutate it
//         kleen.screenshots = { ...kleen.screenshots };
//         for (const key in kleen.screenshots) {
//             kleen.screenshots[key] = { ...kleen.screenshots[key] };
//             if (typeof kleen.screenshots[key].src == 'string') {
//                 const updated = getScreenshotUrl(downloadsBaseUrl, split, kleen.screenshots[key].src);
//                 screenshotMap[kleen.screenshots[key].src] = updated;
//                 kleen.screenshots[key].src = updated;
//             }
//         }
//     }
//     if (kleen.sections) {
//         kleen.sections = { ...kleen.sections };
//         if (typeof kleen.sections?.reviews === 'string') {
//             kleen.sections.reviews = undefined;
//         }
//     }
//     kleen.support_threads = 0;
//     kleen.support_threads_resolved = 0;
//     if (kleen.support_url && kleen.slug && isWordpressOrg(kleen.support_url)) {
//         kleen.support_url = getSupportUrl(supportBaseUrl, kleen.slug);
//     }
//     if (kleen.versions) {
//         // kleen is a shallow copy, deepen it before we mutate it
//         kleen.versions = { ...kleen.versions };
//         for (const version in kleen.versions) {
//             if (version === 'trunk') {
//                 kleen.versions['trunk'] = undefined;
//             } else if (kleen.versions[version]) {
//                 kleen.versions[version] = getZipUrl(downloadsBaseUrl, split, kleen.versions[version]);
//             }
//         }
//     }
//     return kleen;
// }


// /**
//  * Curried function to create a function to handle the migration
//  * of plugin specific data.
//  * @param options command-line options.
//  * @param split directory split name
//  * @param releaseId unique release identifer, e.g. '6.2.2'
//  * @returns a function to convert to new format, with all the info it needs.
//  */
// function getMigratePluginTranslation(options: CommandOptions, split: string, releaseId: string): (original: unknown) => unknown {
//     return function migratePluginTranslation(original: unknown): unknown {
//         if (original &&
//             (typeof original === 'object') &&
//             ('translations' in original) &&
//             Array.isArray(original?.translations)) {
//             // we want to mutate it, so make a copy
//             const translations = original?.translations.slice();
//             for (let n=0; n < translations.length; n++) {
//                 if (translations[n] &&
//                     (typeof translations[n] === 'object') &&
//                     ('package' in translations[n]) &&
//                     (typeof translations[n].package === 'string')) {
//                     const basename = path.basename(translations[n].package);
//                     const pkg = new URL(`/plugins/read-only/legacy/${split}/${releaseId}/l10n/${basename}`, options.downloadsBaseUrl);
//                     // copy before mutate
//                     translations[n] = { ...translations[n] };
//                     translations[n].package = pkg.toString();
//                 }
//             }
//             return { translations };
//         }
//         return original;
//     }
// }

// /**
//  * Query the api to determine which translations/locales are supported for each
//  * version of a plugin. These files are then downloaded.
//  * @param options command-line options.
//  * @param slug unique identifier for the plugin.
//  * @param split directory split.
//  * @param pluginMetaDir where the plugin specific meta data starts
//  * @param pluginReadOnlyDir top of tree of plugin zip files
//  * @param releaseId unique identifier for the release, e.g. '6.2.2'
//  * @returns list of information about downloaded files.
//  */
// async function processPluginTranslations(
//     options: CommandOptions,
//     slug: string,
//     split: string,
//     pluginMetaDir: string,
//     pluginReadOnlyDir: string,
//     releaseId: string
// ): Promise<Array<ArchiveFileSummary>> {
//     const releaseMetaDir = path.join(pluginMetaDir, releaseId)

//     const url = new URL(`/translations/plugins/1.0/`, `https://${options.apiHost}`);
//     url.searchParams.append('slug', slug)
//     url.searchParams.append('version', releaseId);

//     const files: Array<ArchiveFileSummary> = [];
//     const o = await downloadMetaLegacyJson(reporter, jreporter, 'meta', releaseMetaDir,
//                             'translations.json', url, options.force, options.jsonSpaces,
//                             getMigratePluginTranslation(options, split, releaseId));

//     if (o && (typeof o === 'object') && ('translations' in o) && Array.isArray(o.translations)) {
//         const translations: Array<PluginTranslationEntry> = o.translations;
//         const releaseReadOnlyL10nDir = path.join(pluginReadOnlyDir, releaseId, 'l10n');
//         for (const t of translations) {
//             const info = await downloadZip(reporter, jreporter, 'meta', t.package, releaseReadOnlyL10nDir, options.force, options.rehash);
//             files.push(info);
//         }
//     }

//     return files;
// }

// /**
//  * Download the plugin information JSON file, if necessary. The download
//  * may be forced by setting the force parameter. If the file does not
//  * exist, we will attempt to download the file.
//  * @param pluginDir where to put the json file.
//  * @param infoUrl where to get the json file.
//  * @param force if true, remove any old file first.
//  * @returns
//  */
// async function handlePluginInfo(
//     options: CommandOptions,
//     pluginMetaDir: string,
//     infoUrl: URL,
//     split: string,
//     force: boolean,
//     fromAPI: PluginInfo
// ): Promise<Array<PluginDownloadResult>> {
//     const pluginJson = path.join(pluginMetaDir, 'plugin.json');
//     const legacyPluginJson = path.join(pluginMetaDir, 'legacy-plugin.json');

//     try {
//         if (force) {
//             await Deno.remove(pluginJson, { recursive: true });
//             await Deno.remove(legacyPluginJson, { recursive: true });
//         }
//         const legacyContents = await Deno.readTextFile(legacyPluginJson);
//         const legacyObj = JSON.parse(legacyContents);
//         const migratedContents = await Deno.readTextFile(pluginJson);
//         const migratedObj = JSON.parse(migratedContents);
//         return [ legacyObj, migratedObj ];
//     } catch (_) {
//         reporter(`fetch(${infoUrl}) > ${legacyPluginJson}`);
//         const response = await fetch(infoUrl);
//         if (!response.ok) {
//             const error = `${response.status} ${response.statusText}`;
//             reporter(`fetch failed: ${error}`);
//             return [{ error }, { error }];
//         }
//         const json = await response.json();
//         const rawText = JSON.stringify(json, null, options.jsonSpaces);
//         const migrated = migratePluginInfo(options.downloadsBaseUrl,
//                 options.supportBaseUrl, split, json, fromAPI);
//         await savePluginInfo(options, pluginMetaDir, migrated);
//         await Deno.writeTextFile(legacyPluginJson, rawText);
//         return [ json, migrated ];
//     }
// }

// /**
//  * Persist plugin information to a `plugin.json` file.
//  * @param options command-line options.
//  * @param pluginMetaDir where to save the meta data.
//  * @param info plugin information to be saved.
//  */
// async function savePluginInfo(
//     options: CommandOptions,
//     pluginMetaDir: string,
//     info: PluginInfo
// ): Promise<void> {
//     const pluginJson = path.join(pluginMetaDir, 'plugin.json');
//     const text = JSON.stringify(info, null, options.jsonSpaces);
//     await Deno.writeTextFile(pluginJson, text);
// }

// /**
//  *
//  * @param options command-line options.
//  * @param prefixLength number of characters to use in the directory prefix.
//  * @param slug plugin slug.
//  * @returns
//  */
// async function processPlugin(
//     options: CommandOptions,
//     prefixLength: number,
//     slug: string,
//     outdated: boolean,
//     fromAPI: PluginInfo
// ): Promise<GroupDownloadInfo> {
//     const split = splitFilename(slug, prefixLength);
//     const pluginLiveDir = path.join(options.documentRoot, 'plugins', 'live', 'legacy', split);
//     const pluginMetaDir = path.join(options.documentRoot, 'plugins', 'meta', 'legacy', split);
//     const pluginReadOnlyDir = path.join(options.documentRoot, 'plugins', 'read-only', 'legacy', split);

//     const files: Record<string, DownloadFileInfo> = {};
//     const infoUrl = getPluginInfoUrl(options.apiHost, slug);
//     let ok = true;
//     let last_updated_time;
//     try {
//         vreporter(`> mkdir -p ${pluginReadOnlyDir}`);
//         await Deno.mkdir(pluginReadOnlyDir, { recursive: true });
//         vreporter(`> mkdir -p ${pluginMetaDir}`);
//         await Deno. mkdir(pluginMetaDir, { recursive: true });

//         const [ pluginInfo, migratedInfo ] = await handlePluginInfo(options, pluginMetaDir,
//                 infoUrl, split, (outdated || options.force), fromAPI);
//         if (pluginInfo) {
//             if ((typeof pluginInfo.slug !== 'string') ||
//                 (typeof pluginInfo.error === 'string') ||
//                 (typeof pluginInfo.download_link !== 'string')) {
//                 ok = false;
//             } else {
//                 last_updated_time = pluginInfo.last_updated;
//                 let fileInfo;
//                 if (pluginInfo.version) {
//                     const releaseReadOnlyDir = path.join(pluginReadOnlyDir, pluginInfo.version);
//                     vreporter(`> mkdir -p ${releaseReadOnlyDir}`);
//                     await Deno.mkdir(releaseReadOnlyDir, { recursive: true });
//                     fileInfo = await downloadZip(reporter, pluginInfo.download_link, releaseReadOnlyDir, options.force, options.rehash);
//                 } else {
//                     fileInfo = await downloadZip(reporter, pluginInfo.download_link, pluginReadOnlyDir, options.force, options.rehash);
//                 }
//                 ok = ok && (fileInfo.status === 'full');
//                 files[fileInfo.filename] = fileInfo;
//                 if (options.full || options.live) {
//                     let changed = false;
//                     if ((typeof pluginInfo.preview_link === 'string') &&
//                         (pluginInfo.preview_link !== '') &&
//                         (typeof migratedInfo.preview_link === 'string')) {
//                         // preview_link
//                         const previewDir = path.join(pluginLiveDir, 'preview');
//                         vreporter(`> mkdir -p ${previewDir}`);
//                         await Deno.mkdir(previewDir, { recursive: true });
//                         const previewUrl = new URL(pluginInfo.preview_link);
//                         const previewInfo = await downloadLiveFile(reporter, previewUrl, previewDir, 'index.html', options.hashLength);
//                         ok = ok && (previewInfo.status === 'full');
//                         files[previewInfo.filename] = previewInfo;
//                         migratedInfo.preview_link = `${options.downloadsBaseUrl}${previewInfo.filename.substring(options.documentRoot.length+1)}`;
//                         changed = true;
//                     }
//                     if ((typeof pluginInfo.screenshots === 'object') && !Array.isArray(pluginInfo.screenshots)) {
//                         const screenshotsDir = path.join(pluginLiveDir, 'screenshots');
//                         vreporter(`> mkdir -p ${screenshotsDir}`);
//                         await Deno.mkdir(screenshotsDir, { recursive: true });
//                         for (const id of Object.keys(pluginInfo.screenshots)) {
//                             if ((typeof pluginInfo.screenshots[id]?.src === 'string') && migratedInfo.screenshots){
//                                 const src = new URL(pluginInfo.screenshots[id]?.src);
//                                 const filename = path.basename(src.pathname);
//                                 const fileInfo = await downloadLiveFile(reporter, src, screenshotsDir, filename, options.hashLength);
//                                 files[fileInfo.filename] = fileInfo;
//                                 migratedInfo.screenshots[id].src = `${options.downloadsBaseUrl}${fileInfo.filename.substring(options.documentRoot.length+1)}`;
//                                 changed = true;
//                                 ok = ok && (fileInfo.status === 'full');
//                             }
//                         }
//                     }
//                     if ((typeof pluginInfo.banners === 'object') &&
//                         !Array.isArray(pluginInfo.banners) &&
//                         (typeof migratedInfo.banners === 'object') &&
//                         !Array.isArray(migratedInfo.banners)) {
//                         const bannersDir = path.join(pluginLiveDir, 'banners');
//                         vreporter(`> mkdir -p ${bannersDir}`);
//                         await Deno.mkdir(bannersDir, { recursive: true });
//                         if ((typeof pluginInfo.banners?.high === 'string') && (typeof migratedInfo?.banners?.high === 'string')) {
//                             const src = new URL(pluginInfo.banners.high);
//                             const filename = path.basename(src.pathname);
//                             const fileInfo = await downloadLiveFile(reporter, src, bannersDir, filename, options.hashLength);
//                             files[fileInfo.filename] = fileInfo;
//                             migratedInfo.banners.high = `${options.downloadsBaseUrl}${fileInfo.filename.substring(options.documentRoot.length+1)}`;
//                             changed = true;
//                             ok = ok && (fileInfo.status === 'full');
//                         }
//                         if (typeof pluginInfo.banners?.low === 'string') {
//                             const src = new URL(pluginInfo.banners.low);
//                             const filename = path.basename(src.pathname);
//                             const fileInfo = await downloadLiveFile(reporter, src, bannersDir, filename, options.hashLength);
//                             files[fileInfo.filename] = fileInfo;
//                             migratedInfo.banners.low = `${options.downloadsBaseUrl}${fileInfo.filename.substring(options.documentRoot.length+1)}`;
//                             changed = true;
//                             ok = ok && (fileInfo.status === 'full');
//                         }
//                     }
//                     if (changed) {
//                         updateScreenshotText(pluginInfo, migratedInfo);
//                         await savePluginInfo(options, pluginMetaDir, migratedInfo);
//                     }
//                 }
//                 if (options.full || options.zips) {
//                     if (typeof pluginInfo.versions === 'object') {
//                         for (const version of Object.keys(pluginInfo.versions)) {
//                             if ((version !== 'trunk') && pluginInfo.versions[version]) {
//                                 if (pluginInfo.version !== version) {
//                                     const fileInfo = await downloadZip(reporter, pluginInfo.versions[version], pluginReadOnlyDir, options.force, options.rehash);
//                                     files[fileInfo.filename] = fileInfo;
//                                     ok = ok && (fileInfo.status === 'complete');
//                                 }
//                                 const l10n = await processPluginTranslations(options, slug, split, pluginMetaDir, pluginReadOnlyDir, version);
//                                 for (const item of l10n) {
//                                     files[item.filename] = item;
//                                     ok = ok && (item.status === 'complete');
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

// /**
//  * Replace old URL's with new ones in the screenshot summary text.
//  * @param original plugin information from upstream
//  * @param migrated localized version of plugin information
//  */
// function updateScreenshotText(original: PluginInfo, migrated: PluginInfo): void {
//     migrated.sections = { ... migrated.sections };
//     if ((typeof migrated.sections?.screenshots === 'string') && (typeof migrated?.screenshots === 'object')) {
//         let contents = migrated.sections.screenshots;
//         for (const key in original.screenshots) {
//             if ((typeof original.screenshots[key].src === 'string') && (typeof migrated?.screenshots[key].src === 'string')) {
//                 const search = new RegExp(escape(original.screenshots[key].src), 'g');
//                 const replacement = migrated.screenshots[key].src;
//                 contents = contents.replaceAll(search, replacement);
//             }
//         }
//         migrated.sections.screenshots = contents;
//     }

// }

// /**
//  * Determine the URL to use to request plugin information.
//  * @param apiHost where the API is.
//  * @param name slug used to access the plugin.
//  * @returns
//  */
// function getPluginInfoUrl(apiHost: string, name: string): URL {
//     const url = new URL('/plugins/info/1.2/', `https://${apiHost}`);
//     url.searchParams.append('action', 'plugin_information');
//     url.searchParams.append('slug', name);
//     return url;
// }

// /**
//  *
//  * @param options command-line options.
//  * @param prefixLength number of characters in prefix of split filename.
//  * @param pluginSlugs list of plugin slugs.
//  */
// async function downloadPluginFiles(
//     options: CommandOptions,
//     prefixLength: number,
//     pluginSlugs: Array<string>,
//     pluginList: Array<PluginInfo>): Promise<void> {

//     const statusFilename = path.join(options.documentRoot, 'plugins', 'meta', options.statusFilename);
//     const status = await readDownloadStatus(statusFilename, pluginSlugs);
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
//         if (!pluginSlugs.includes(slug)) {
//             status.map[slug].status = 'uninteresting';
//         }
//     }

//     for (const item of pluginList) {
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
//                 (typeof item?.last_updated === 'string') &&
//                 (status.map[slug].last_updated_time < item.last_updated)) {
//                 status.map[slug].status = 'outdated';
//             }
//             // determine if we need this plugin
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
//                 const pluginStatus = await processPlugin(options, prefixLength, slug, outdated, item);
//                 if ((pluginStatus.status === 'full') || (pluginStatus.status === 'partial')) {
//                     success += 1;
//                 } else if (pluginStatus.status === 'failed') {
//                     failure += 1;
//                 } else {
//                     console.error(`Warning: unknown status after processPlugin: slug=${slug}`);
//                 }
//                 changed = true;
//                 const existing = status.map[slug].files;
//                 status.map[slug].status = pluginStatus.status;
//                 status.map[slug].when = pluginStatus.when;
//                 status.map[slug].last_updated_time = pluginStatus.last_updated_time;
//                 status.map[slug].files = {};
//                 for (const name in pluginStatus.files) {
//                     status.map[slug].files[name] = mergeDownloadInfo(existing[name], pluginStatus.files[name]);
//                 }

//                 ok = ok && (pluginStatus.status !== 'failed');
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
//             reporter('');
//             reporter(`plugins processed:  ${soFar}`);
//             reporter(`successful:         ${success}`);
//             reporter(`failures:           ${failure}`);
//             reporter(`skipped:            ${skipped}`);
//         }
//     }
//     status.when = Date.now();
//     reporter(`save status > ${statusFilename}`);
//     ok = await saveDownloadStatus(statusFilename, status) && ok;

//     reporter(`Total plugins processed:  ${soFar}`);
//     reporter(`Total successful:         ${success}`);
//     reporter(`Total failures:           ${failure}`);
//     reporter(`Total skipped:            ${skipped}`);
// }
