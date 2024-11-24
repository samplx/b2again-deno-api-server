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

import { LiveFileSummary } from './archive-status.ts';
import type { LiveUrlProviderResult, MigrationContext, UrlProviderResult } from './standards.ts';
import { escape } from 'jsr:@std/regexp';

/**
 * how to migrate an upstream resource (theme, plugin), to the
 * downstream version.
 */

/**
 * a field level migration function. used to handle the migration of a
 * field value from the upstream to the downstream. we keep the processing
 * as generic as possible.
 */
export type MigrationProvider<T> = (ctx: MigrationContext, upstream: unknown) => T;

/**
 * a generic structure migration provider.
 * each field in the parametric parameter (i.e. generic) structure type
 * has an optional migration provider that can be used to change the upstream
 * field value as part of the migration process.
 */
export type MigrationStructureProvider<Structure extends Record<string, unknown>> = {
    [Property in keyof Structure]?: MigrationProvider<Structure[Property]>;
};

/**
 * Generic structure migrations. Used to migrate data from upstream
 * into the downstream format. This is where URL's and hosts get mapped
 * from upstream versions into how we want to maintain them. The
 * policy of how to perform the migration is isolated into the migrator
 * provider structure. It has a field with the same name as the parent
 * structure that will migrate the upstream field to its downstream
 * value.
 * @param migrator injectable migrator provider.
 * @param ctx migration context. information used to migration urls.
 * @param upstream content to be migrated as delivered from upstream.
 * @returns
 */
export function migrateStructure<Structure extends Record<string, unknown>>(
    migrator: MigrationStructureProvider<Structure>,
    ctx: MigrationContext,
    upstream: Structure,
): Structure {
    const clone = structuredClone(upstream) as Record<string, unknown>;
    for (const key of Object.keys(migrator)) {
        if ((key in clone) && clone[key] && (typeof key === 'string') && migrator[key]) {
            clone[key] = migrator[key](ctx, clone[key]);
        }
    }
    return clone as Structure;
}

/**
 * Add a cache friendly middle section to a filename.
 * @param name original filename.
 * @param middle the cache stamp middle.
 * @param middleLength how many characters to keep in the middle.
 * @returns 'chunkhash'd filename.
 */
export function liveFilename(
    name: string,
    middle: string,
    middleLength: number,
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
 * create a pattern that will match a live filename with some hash value.
 * @param p details about the url and local resource.
 * @returns regexp that will match url with a hash.
 */
function liveFilenamePattern(
    p: LiveUrlProviderResult,
): RegExp {
    const lastDot = p.filename.lastIndexOf('.');
    let last;
    if (lastDot < 0) {
        last = escape(`${p.filename}-`) + '.*';
    } else {
        const front = p.filename.substring(0, lastDot);
        const ext = p.filename.substring(lastDot).toLowerCase();
        last = `${escape(front)}-.*${escape(ext)}`;
    }
    const full = escape(`${p.host}:${p.dirname}/`) + last;
    return new RegExp(full);
}

/**
 * determine if we have an existing live file that matches the pattern.
 * this function just checks the map, it doesn't actually check to see
 * if the file exists on S3 or a file system.
 * @param ctx bag of information needed to convert urls.
 * @param p details about the url and local resource.
 * @param live map of existing live files.
 * @returns true if there is a matching live file.
 */
export function liveFileExists(
    ctx: MigrationContext,
    p: LiveUrlProviderResult,
    live: Record<string, LiveFileSummary>,
): boolean {
    if (!ctx.hosts[p.host]) {
        throw new Deno.errors.NotSupported(`host ${p.host} is not defined in ctx`);
    }
    const matcher = liveFilenamePattern(p);
    const values = Object.values(live);
    const filtered = values.filter((lfs) => matcher.test(lfs.key));
    return (filtered.length > 0);
}

/**
 * determine the live url for a migration step from the
 * provider results and a migration context and current
 * live file map.
 * @param ctx bag of information needed to convert urls.
 * @param p details about the url and local resource.
 * @param live map of existing live files.
 * @returns string URL for the live url.
 */
export function getLiveUrlFromProvider(
    ctx: MigrationContext,
    p: LiveUrlProviderResult,
    live: Record<string, LiveFileSummary>,
): string {
    if (!ctx.hosts[p.host]) {
        throw new Deno.errors.NotSupported(`host ${p.host} is not defined in ctx`);
    }
    const matcher = liveFilenamePattern(p);
    const values = Object.values(live);
    const filtered = values.filter((lfs) => matcher.test(lfs.key));
    const sorted = filtered.sort((a, b) => (b.generation ?? 0) - (a.generation ?? 0));
    if (sorted.length === 0) {
        return new URL(`${p.dirname}/${p.filename}`, ctx.hosts[p.host].baseUrl).toString();
    }
    const key = sorted[0].key;
    return new URL(key.substring(key.indexOf(':')+1), ctx.hosts[p.host].baseUrl).toString();
}

/**
 * determine the url for a migration step from the provider results and
 * a migration context.
 * @param ctx bag of information needed to convert urls
 * @param p details about the url and local resource
 * @returns string URL
 */
export function getUrlFromProvider(ctx: MigrationContext, p: UrlProviderResult): string {
    if (!p.host || !ctx.hosts[p.host]) {
        throw new Deno.errors.NotSupported(`host ${p.host} is not defined in ctx`);
    }
    if (!p.relative) {
        return '';
    }
    return new URL(p.relative, ctx.hosts[p.host].baseUrl).toString();
}
