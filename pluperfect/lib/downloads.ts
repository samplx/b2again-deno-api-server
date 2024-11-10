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

/// <reference types="npm:@types/node" />
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { ConsoleReporter, JsonReporter } from "../../lib/reporter.ts";
import * as path from "jsr:@std/path";
import { ArchiveFileSummary } from "../../lib/archive-status.ts";
import { ContentHostType, StandardLocations, UrlProviderResult } from "../../lib/standards.ts";

/**
 * A simple Either-like interface for an error (left-side) value.
 */
export interface DownloadErrorInfo {
    error?: string;
}

/**
 * determine if download is needed. has side-effects.
 * @param details upstream url and downstream pathname.
 * @param force should we remove the files before we start.
 * @returns
 */
async function isDownloadNeeded(
    details: UrlProviderResult,
    force: boolean,
): Promise<boolean> {
    if (!details.pathname) {
        throw new Deno.errors.NotSupported('details.pathname must be defined');
    }
    let needed = false;
    try {
        const fileInfo = await Deno.lstat(details.pathname)
        if (!fileInfo.isFile || force) {
            await Deno.remove(details.pathname, { recursive: true });
            needed = true;
        }
    } catch (_) {
        needed = true;
    }
    return needed;
}

/**
 * attempt to download a remote resource to a local file.
 * @param jreporter how to report structured JSON.
 * @param details upstream url and downstream pathname.
 * @returns details about the downloaded file, including hashes if complete.
 */
async function fetchFile(
    jreporter: JsonReporter,
    details: UrlProviderResult,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.pathname || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }

    const targetDir = path.dirname(details.pathname);
    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');

    await Deno.mkdir(targetDir, { recursive: true });
    const output = createWriteStream(details.pathname, {
        flags: 'wx',
        encoding: 'binary'
    });
    const response = await fetch(details.upstream);
    if (!response.ok || !response.body) {
        output.close();
        jreporter({operation: 'downloadFile', action: 'fetch', sourceUrl: details.upstream, filename: details.pathname, error: `${response.status}`});
        return {
            host: details.host,
            filename: details.pathname,
            status: 'failed',
            is_readonly: false,
            when
        };
    }
    for await (const chunk of response.body) {
        md5hash.update(chunk);
        sha1hash.update(chunk);
        sha256hash.update(chunk);
        output.write(chunk);
    }
    const md5 = md5hash.digest('hex');
    const sha1 = sha1hash.digest('hex');
    const sha256 = sha256hash.digest('hex');
    output.close();
    if (details.is_readonly) {
        await Deno.chmod(details.pathname, 0o444);
    }
    return {
        host: details.host,
        filename: details.pathname,
        status: 'complete',
        is_readonly: !!details.is_readonly,
        when,
        md5,
        sha1,
        sha256
    }
}

/**
 * read a previously downloaded file to calculate its message
 * digests (hashes). They are md5, sha1 and sha256 currently.
 * @param jreporter how to report structured JSON
 * @param details upstream url and downstream pathname.
 * @returns summary data including message digests (md5, sha1, and sha256)
 */
async function recalculateHashes(
    jreporter: JsonReporter,
    details: UrlProviderResult,
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.pathname || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }

    const when = Date.now();
    const md5hash = createHash('md5');
    const sha1hash = createHash('sha1');
    const sha256hash = createHash('sha256');
    let md5;
    let sha1;
    let sha256;

    try {
        return await new Promise((resolve, reject) => {
            if (!details.host || !details.pathname || !details.upstream) {
                throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
            }
            const input = createReadStream(details.pathname);
            input
                .on('end', () => {
                    if (!details.host || !details.pathname || !details.upstream) {
                        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
                    }
                    sha256 = sha256hash.digest('hex');
                    md5 = md5hash.digest('hex');
                    sha1 = sha1hash.digest('hex');
                    jreporter({operation: 'downloadFile', action: 'rehash', sourceUrl: details.upstream, filename: details.pathname});
                    resolve ({
                        host: details.host,
                        filename: details.pathname,
                        status: 'complete',
                        is_readonly: false,
                        when,
                        sha256,
                        md5,
                        sha1
                    });
                })
                .on('data', (chunk) => {
                    md5hash.update(chunk);
                    sha1hash.update(chunk);
                    sha256hash.update(chunk);
                })
                .on('error', reject);
        });
    } catch (e) {
        console.error(`Error: ${e} unable to read file to compute hashes: ${details.pathname}`);
        jreporter({operation: 'downloadFile', action: 'rehash', sourceUrl: details.upstream, filename: details.pathname, error: e});
        return {
            host: details.host,
            filename: details.pathname,
            status: 'failed',
            is_readonly: false,
            when,
        };
    }

}

/**
 * Download a file, if required.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host which host holds the file.
 * @param sourceUrl where to download the file.
 * @param targetFile where to put the file.
 * @param [force=false] if we must download file the even if we have a copy.
 * @param [needHash=true] if we should read the file if it exists to calculate the hash.
 * @returns true if download was successful, false if not.
 */
export async function downloadFile(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    details: UrlProviderResult,
    force: boolean = false,
    needHash: boolean = true
): Promise<ArchiveFileSummary> {
    if (!details.host || !details.pathname || !details.upstream) {
        throw new Deno.errors.NotSupported('upstream, host and pathname must be defined');
    }
    const needed = await isDownloadNeeded(details, force);
    const when = Date.now();

    if (needed) {
        reporter(`fetch(${details.upstream}) > ${details.pathname}`);

        try {
            return await fetchFile(jreporter, details);
        } catch (e) {
            console.error(`Error: unable to save file: ${details.pathname}`);
            jreporter({operation: 'downloadFile', action: 'fetch', sourceUrl: details.upstream, filename: details.pathname, error: e});
            return {
                host: details.host,
                filename: details.pathname,
                status: 'failed',
                is_readonly: false,
                when
            };
        }
    }
    if (needHash) {
        return await recalculateHashes(jreporter, details);
    }
    jreporter({operation: 'downloadFile', action: 'existing', sourceUrl: details.upstream, filename: details.pathname, needHash, needed });
    return {
        host: details.host,
        filename: details.pathname,
        status: 'complete',
        is_readonly: !!details.is_readonly,
        when,
    };
}

/**
 * Add a cache friendly middle section to a filename.
 * @param name original filename.
 * @param middle the cache stamp middle.
 * @param middleLength how many characters to keep in the middle.
 * @returns 'chunkhash'd filename.
 */
function liveFilename(
    name: string,
    middle: string,
    middleLength: number
): string {
    const center = (middleLength > middle.length) ? middle : middle.substring(0, middleLength);
    const lastDot = name.lastIndexOf('.');
    if (lastDot < 0) {
        return `${name}-${center}`;
    }
    const front = name.substring(0, lastDot);
    const ext = name.substring(lastDot).toLowerCase();
    return `${front}-${center}${ext}`;
}

/**
 * Download a 'live' file. A mutable file that will be downloaded
 * and then renamed based upon its content. Since we do not know
 * the SHA-256 before we download it, we will always download the
 * file. Then the SHA-256 is used to rename the file. If there is
 * a collision, the files contents are assumed to be the same.
 * We preserve the old file when there is a collision in order to
 * keep the old timestamps.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param sourceUrl what is to be downloaded.
 * @param targetDir directory part of the target filename.
 * @param originalName original filename part of the URL.
 * @param middleLength number of characters in the 'hash' portion.
 * @returns information about the downloaded file, including its new name.
 */
export async function downloadLiveFile(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    host: ContentHostType,
    sourceUrl: URL,
    targetDir: string,
    originalName: string,
    middleLength: number
): Promise<ArchiveFileSummary> {
    const filename = path.join(targetDir, liveFilename(originalName, 'download', middleLength));
    if (!locations.ctx.hosts[host] || !locations.ctx.hosts[host].baseUrl) {
        throw new Deno.errors.NotSupported(`${host} is not defined in migration context`);
    }
    const details = { host, upstream: sourceUrl.toString(), filename, url: sourceUrl };
    const info = await downloadFile(reporter, jreporter, details, true);
    if (middleLength === 0) {
        jreporter({operation: 'downloadLiveFile', filename});
        return info;
    }
    if ((info.status === 'complete') && (typeof info.sha256 === 'string')) {
        const finalName = path.join(targetDir, liveFilename(originalName, info.sha256, middleLength));
        const updated = { ... info };
        updated.filename = finalName;
        try {
            // a rename would keep the new file, we want to keep the old one
            await Deno.lstat(finalName);
            // if we make it here, we don't need the file we just downloaded
            await Deno.remove(filename, { recursive: true });
        } catch (_) {
            // (at least when the lstat was executed the file didn't exist, so rename)
            try {
                await Deno.rename(filename, finalName);
                jreporter({operation: 'downloadLiveFile', finalName});
            } catch (_) {
                // ignore second failure
            }
        }
        return updated;
    }
    return info;
}

/**
 * attempt to read the legacy and migrated JSON files locally. This
 * code will throw exceptions, so it needs to be inside a try/catch block.
 * @param legacyJson pathname of the legacy version of the JSON file.
 * @param migratedJson pathname of the migrated version of the JSON file.
 * @param force always remove existing files.
 * @param migrate how to convert from legacy to modern.
 * @returns tuple of the legacy data and the modern data.
 */
async function readMetaLegacyJson<T extends Record<string, unknown>> (
    legacyJson: string,
    migratedJson: string,
    force: boolean
): Promise<[ T, T ]> {
    if (force) {
        await Deno.remove(migratedJson, { recursive: true });
        await Deno.remove(legacyJson, { recursive: true });
    }
    const legacyContents = await Deno.readTextFile(legacyJson);
    const legacy = JSON.parse(legacyContents);
    const migratedContents = await Deno.readTextFile(migratedJson);
    const migrated = JSON.parse(migratedContents);
    return [ legacy, migrated ];
}

/**
 * attempt to fetch a remote resource and then store it in two
 * files. the first is the legacy format, then a migrate function is
 * executed to convert the data which is then serialized to the migrated
 * JSON file. the "modern" version has our URL's, data filtered, etc.
 * @param legacyJson pathname of the legacy version of the JSON file.
 * @param migratedJson pathname of the migrated version of the JSON file.
 * @param url upstream resource of the legacy data.
 * @param spaces how to expand JSON.
 * @param migrate how to convert from legacy to modern.
 * @returns tuple of the legacy data and the migrated data.
 */
async function fetchMetaLegacyJson<T extends Record<string, unknown>>(
    legacyJson: string,
    migratedJson: string,
    url: URL,
    spaces: string,
    migrate: (original: T) => T
): Promise<[ T, T ]> {
    const response = await fetch(url);
    if (!response.ok) {
        const error = { error: `${response.status} ${response.statusText}` } as unknown as T;
        return [ error, error ] ;
    }

    const legacy = await response.json();
    const legacyText = JSON.stringify(legacy, null, spaces);
    const migrated = migrate(legacy);
    const migratedText = JSON.stringify(migrated, null, spaces);
    const metaDir = path.dirname(migratedJson);
    await Deno.mkdir(metaDir, { recursive: true });
    await Deno.writeTextFile(migratedJson, migratedText);
    await Deno.writeTextFile(legacyJson, legacyText);

    return [ legacy, migrated ];
}

/**
 * Download a Meta-data JSON file, and perform a transform to convert it
 * from "legacy" format. Both formats are maintained on disk.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param legacyJson pathname to the legacy version of the data.
 * @param migratedJson pathname to the migrated version of the data.
 * @param url source URL.
 * @param force true to force a download, false keeps any existing file
 * @param spaces JSON stringify spaces.
 * @param migrate function to map legacy to "modern" items.
 * @returns tuple of the legacy data and the modern format.
 */
export async function downloadMetaLegacyJson<T extends Record<string, unknown>>(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    legacyJson: string,
    migratedJson: string,
    url: URL,
    force: boolean,
    spaces: string,
    migrate: (original: T) => T
): Promise<[ T, T ]> {
    try {
        const [ legacy, migrated ] = await readMetaLegacyJson(legacyJson, migratedJson, force);
        jreporter({operation: 'downloadMetaLegacyJson', action: 'read', host, url: url.toString(), migratedJson, legacyJson});
        return [ legacy as T, migrated as T];
    } catch (_) {
        reporter(`fetch(${url}) > ${legacyJson}`);
        try {
            const [ legacy, migrated ] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
            if (legacy.error) {
                console.error(`downloadMetaLegacyJson: legacy.error: ${legacy.error}`);
                reporter(`fetch failed: ${legacy.error}`);
                jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson, error: legacy.error });
            } else {
                jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson})
            }
            return [ legacy, migrated ];
        } catch (e) {
            jreporter({operation: 'downloadMetaLegacyJson', action: 'fetch', host, url: url.toString(), migratedJson, legacyJson, error: `${e}`})
            const error = { error: `${e}` } as unknown as T;
            console.error(`downloadMetaLegacyJson: second catch: ${e}`);
            return [ error, error ] ;
        }
    }
}

/**
 * download a JSON file to determine if it has changed compared
 * to the copy already on disk (if any). Returns three values,
 * a flag indicating if the file just downloaded was a change,
 * the legacy copy of the data, and the migrated copy.
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param legacyJson pathname to the legacy version of the data.
 * @param migratedJson pathname to the migrated version of the data.
 * @param url source URL.
 * @param spaces  JSON stringify spaces.
 * @param migrate function to map legacy to "modern" items.
 * @returns tuple of three values: changed, legacy and migrated.
 */
export async function probeMetaLegacyJson<T extends Record<string, unknown>>(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    legacyJson: string,
    migratedJson: string,
    url: URL,
    spaces: string,
    migrate: (original: T) => T
): Promise<[ boolean, T, T ]> {

    // first check to see if the files exist, if not, they are changed
    try {
        await Deno.lstat(legacyJson);
        await Deno.lstat(migratedJson);
    } catch (_) {
        const [ legacy, migrated ] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
        return [ true, legacy, migrated ];
    }

    // both the files exist, so we download a temporary copy
    let tempLegacy;
    try {
        const metaDir = path.dirname(legacyJson);
        tempLegacy = await Deno.makeTempFile({ dir: metaDir, prefix: 'probe-', suffix: '.json'});
        const [ legacy, migrated ] = await readMetaLegacyJson(legacyJson, migratedJson, false);
        const tempJson = await downloadMetaJson(reporter, jreporter, host, tempLegacy, url, true, spaces);
        const tempContents = await Deno.readFile(tempLegacy);
        const legacyContents = await Deno.readFile(legacyJson);
        let same = true;
        if (tempContents.length === legacyContents.length) {
            for (let n=0; n < tempContents.length; n++) {
                same = same && (tempContents.at(n) === legacyContents.at(n));
                if (!same) {
                    break;
                }
            }
        }
        if (same) {
            await Deno.remove(tempLegacy, { recursive: true });
            return [ false, legacy as T, migrated as T ];
        }
        await Deno.remove(legacyJson, { recursive: true });
        const newMigrated = migrate(tempJson as T);
        const newMigratedText = JSON.stringify(newMigrated, null, spaces);
        await Deno.writeTextFile(migratedJson, newMigratedText);
        await Deno.rename(tempLegacy, legacyJson);
    } catch (_) {
        // something failed during the upgrade process, so we will
        // just download the file again below
        if (tempLegacy) {
            try {
                // attempt to remove the temporary file if one was created.
                await Deno.remove(tempLegacy, { recursive: true });
            } catch (_) {
                // ignore any errors.
            }
        }
    }
    const [ legacy, migrated ] = await fetchMetaLegacyJson(legacyJson, migratedJson, url, spaces, migrate);
    return [ true, legacy, migrated ];
}

/**
 * attempt to read a JSON meta data file. this code throws exceptions,
 * so it should be inside a try/catch block.
 * @param jsonFilename name of the file on the local filesystem.
 * @param force true to remove the file before we start to force download.
 * @returns parsed JSON contents of the file, or an exception.
 */
async function readMetaJson(
    jsonFilename: string,
    force: boolean,
): Promise<unknown> {
    if (force) {
        await Deno.remove(jsonFilename, { recursive: true });
    }
    const contents = await Deno.readTextFile(jsonFilename);
    const json = JSON.parse(contents);
    return json;

}

/**
 * attempts to fetch a remote resource and store it into a local file.
 * @param jsonFilename where to store the file on the local filesystem.
 * @param url upstream resource to read.
 * @param spaces how to expand JSON.
 * @returns parsed JSON contents of the upstream resource.
 */
async function fetchMetaJson(
    jsonFilename: string,
    url: URL,
    spaces: string
): Promise<unknown> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const error = `${response.status} ${response.statusText}`;
            return { error };
        }
        const raw = await response.json();
        const rawText = JSON.stringify(raw, null, spaces);
        const metaDir = path.dirname(jsonFilename);
        await Deno.mkdir(metaDir, { recursive: true });
        await Deno.writeTextFile(jsonFilename, rawText);
        return raw;
    } catch (e) {
        return { error: `${e}` };
    }
}

/**
 * Download a Meta-data JSON file that is maintained in the
 * one format (i.e. no "migration" needed).
 * @param reporter how to report non-error information.
 * @param jreporter JSON structured logger.
 * @param host where the files live.
 * @param jsonFilename name of the output file.
 * @param url source URL.
 * @param force true to force a download, false keeps any existing file
 * @param spaces JSON stringify spaces.
 * @returns JSON parsed data.
 */
export async function downloadMetaJson(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    host: ContentHostType,
    jsonFilename: string,
    url: URL,
    force: boolean,
    spaces: string
): Promise<unknown> {
    try {
        const json = await readMetaJson(jsonFilename, force);
        jreporter({operation: 'downloadMetaJson', action: 'read', host, url: url.toString(), jsonFilename})
        return json;
    } catch (_) {
        reporter(`fetch(${url}) > ${jsonFilename}`);
        try {
            const response = await fetchMetaJson(jsonFilename, url, spaces);
            if (response && (typeof response === 'object') && ('error' in response)) {
                reporter(`fetch failed: ${response.error}`);
                jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), jsonFilename, error: response.error });
            } else {
                jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), jsonFilename})
            }
            return response;
        } catch (e) {
            jreporter({operation: 'downloadMetaJson', action: 'fetch', host, url: url.toString(), error: e});
            return { error: e };
        }
    }
}


