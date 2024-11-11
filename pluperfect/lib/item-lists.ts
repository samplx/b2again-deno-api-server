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

import { CommandOptions } from './options.ts';
import { parse } from 'jsr:@std/jsonc';
import * as path from 'jsr:@std/path';
import { ConsoleReporter, JsonReporter } from '../../lib/reporter.ts';
import {
    CommonUrlProvider,
    META_LIST_SLUG_VALUES,
    MetaListItemType,
    MetaListSlug,
    StandardLocations,
} from '../../lib/standards.ts';

export type ItemBrowseOptions = 'featured' | 'new' | 'popular' | 'updated' | undefined;

export interface ItemType {
    slug: string;
    // theme:  "last_updated_time": "2024-07-16 13:32:12",
    // plugin: "last_updated": "2024-08-05 2:02pm GMT",
    updated?: string;
}

export type ItemLists = Record<string, Array<ItemType>>;

/**
 * Determine the URL to use to query a list of items.
 * @param apiHost where the API is.
 * @param pageNumber which page of data requested.
 * @param [browse=undefined] browse parameter to query request (if any).
 * @returns
 */
function getItemListUrl(
    apiHost: string,
    itemType: MetaListItemType,
    pageNumber: number = 1,
    browse?: ItemBrowseOptions,
): URL {
    const url = new URL(`/${itemType}s/info/1.2/`, `https://${apiHost}`);
    url.searchParams.append('action', `query_${itemType}s`);
    if (itemType === 'plugin') {
        url.searchParams.append('fields[]', 'last_updated');
    } else {
        url.searchParams.append('fields[]', 'last_updated_time');
    }
    // url.searchParams.append('fields[]','ratings');
    // url.searchParams.append('fields[]','active_installs');
    // url.searchParams.append('fields[]','sections');
    // url.searchParams.append('fields[]','parent');
    // url.searchParams.append('fields[]','template');
    url.searchParams.append('per_page', '100');
    url.searchParams.append('page', `${pageNumber}`);
    if (browse) {
        url.searchParams.append('browse', browse);
    }
    return url;
}

/**
 * Query the API server for a list of information.
 * @param apiHost hostname to query for the information.
 * @param browse what kind of information to request.
 * @returns list of information.
 */
async function getAPIItemList(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    apiHost: string,
    itemType: MetaListItemType,
    browse: ItemBrowseOptions,
): Promise<Array<ItemType>> {
    const collection: Array<ItemType> = [];
    let pages: number = 1;
    let page: number = 1;
    while (page <= pages) {
        const url = getItemListUrl(apiHost, itemType, page, browse);
        reporter(`fetch(${url})`);
        const response = await fetch(url);
        if (response.ok) {
            const json = await response.json();
            if ((typeof json.info === 'object') && (typeof json.info.pages === 'number')) {
                pages = json.info.pages;
            }
            if (Array.isArray(json[`${itemType}s`])) {
                const all = json[`${itemType}s`];
                if (all) {
                    all.forEach((item: unknown) => {
                        if (
                            item &&
                            (typeof item === 'object') &&
                            ('slug' in item) &&
                            (typeof item.slug === 'string')
                        ) {
                            let updated: undefined | string;
                            if (
                                ('last_updated_time' in item) &&
                                (typeof item.last_updated_time === 'string')
                            ) {
                                // theme:  "last_updated_time": "2024-07-16 13:32:12",
                                const last_updated_time = item.last_updated_time;
                                updated = `${last_updated_time.substring(0, 10)}T${last_updated_time.substring(11)}Z`;
                            } else if (
                                ('last_updated' in item) &&
                                (typeof item.last_updated === 'string')
                            ) {
                                // plugin: "last_updated": "2024-08-05 2:02pm GMT",
                                updated = `${item.last_updated.substring(0, 10)}T00:00:00Z`;
                            }
                            collection.push({ slug: item.slug, updated });
                        }
                    });
                }
            }
        }
        page += 1;
    }
    jreporter({ operation: 'getAPIItemList', apiHost, itemType, browse, pages, size: collection.length });
    return collection;
}

/**
 * Query the API server to get a list of theme information.
 * @param apiHost where to get the list of themes.
 * @param browse what kind of request.
 * @returns list of theme's information.
 */
async function getUnlimitedItemList(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    itemType: MetaListItemType,
    kind: MetaListSlug,
): Promise<Array<ItemType>> {
    if (kind === 'interesting') {
        const interesting = locations[`${itemType}Slugs`].interesting;
        if (interesting) {
            const { pathname } = interesting(locations.ctx);
            if (pathname) {
                return await getInterestingItems(reporter, jreporter, pathname);
            }
        }
        return [];
    }
    if (kind === 'rejected') {
        const rejected = locations[`${itemType}Slugs`].rejected;
        if (rejected) {
            const { pathname } = rejected(locations.ctx);
            if (pathname) {
                return await getInterestingItems(reporter, jreporter, pathname);
            }
        }
        return [];
    }
    if (kind === 'effective') {
        return [];
    }
    if (kind === 'defaults') {
        return await getAPIItemList(reporter, jreporter, locations.apiHost, itemType, undefined);
    }
    return await getAPIItemList(reporter, jreporter, locations.apiHost, itemType, kind);
}

/**
 * Query the API server to get list of theme information. Impose
 * any optional limit on the number of entires.
 * @param options where to get the list of themes.
 * @param kind what kind of request.
 * @returns list of theme's information possiblily limited.
 */
export async function getItemList(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    itemType: MetaListItemType,
    kind: MetaListSlug,
): Promise<Array<ItemType>> {
    const list = await getUnlimitedItemList(reporter, jreporter, locations, itemType, kind);
    return list;
}

/**
 * intersect two lists of items.
 * @param first list of items that should remain in the second.
 * @param second list of items whose order should be preserved.
 * @returns intersection of the two lists.
 */
function listIntersection(first: Array<ItemType>, second: Array<ItemType>): Array<ItemType> {
    const result: Array<ItemType> = [];
    const slugMap: Record<string, true> = {};

    first.forEach((item) => {
        slugMap[item.slug] = true;
    });
    second.forEach((item) => {
        if (slugMap[item.slug]) {
            result.push(item);
        }
    });
    return result;
}

/**
 * filter a list of items.
 * @param rejected list of items to be rejected.
 * @param proposed list of items we want to filter.
 * @returns second list in order with items from the first list removed.
 */
function listRemoval(rejected: Array<ItemType>, proposed: Array<ItemType>) {
    if (rejected.length === 0) {
        return proposed;
    }
    const result: Array<ItemType> = [];
    const slugMap: Record<string, true> = {};

    rejected.forEach((item) => {
        slugMap[item.slug] = true;
    });
    proposed.forEach((item) => {
        if (!slugMap[item.slug]) {
            result.push(item);
        }
    });
    return result;
}

/**
 * list item union.
 * @param members list of lists of items.
 * @returns list of items that is the union of all the parent lists.
 */
function listUnion(members: Array<Array<ItemType>>): Array<ItemType> {
    const slugMap: Record<string, true> = {};
    const result: Array<ItemType> = [];
    for (const member of members) {
        member.forEach((item) => {
            if (!slugMap[item.slug]) {
                slugMap[item.slug] = true;
                result.push(item);
            }
        });
    }
    return result;
}

/**
 * remove duplicate slugs in list of items.
 * @param list list of items.
 * @returns list of items with unique slugs.
 */
function listUnique(list: Array<ItemType>): Array<ItemType> {
    const slugMap: Record<string, true> = {};
    const result: Array<ItemType> = [];
    list.forEach((item) => {
        if (!slugMap[item.slug]) {
            slugMap[item.slug] = true;
            result.push(item);
        }
    });
    return result;
}

/**
 * Attempt to return a list of items in an optimal order.
 * if there is an interesting list, we use it. if there
 * is an updated list, we check to see if there are any
 * slugs in the effective list that are not in the updated
 * list. those we put first, then updated in order. the
 * assumption is that the "fall-through-the-cracks" slugs
 * are for the most recent inserts, so get them first.
 * the goal is to be able to stop downloading themes when
 * we hit ones that are not changing. since there are no
 * useful timestamps available in any of the lists of themes
 * we have to jump through a few hoops to avoid downloading
 * at least 13k theme.json files just to make sure we get
 * timely updates.
 * @param lists current list of items.
 * @returns list of slugs in "optimal" updated order?
 */
export function getInUpdateOrder(lists: ItemLists): Array<string> {
    if (Array.isArray(lists.interesting) && (lists.interesting.length > 0)) {
        return lists.interesting.map((item) => item.slug);
    }
    if (!Array.isArray(lists.effective)) {
        throw new Deno.errors.BadResource(`effective list cannot be empty`);
    }
    if (Array.isArray(lists.updated)) {
        if (lists.updated.length === lists.effective.length) {
            return lists.updated.map((item) => item.slug);
        } else {
            const front = listRemoval(lists.updated, lists.effective);
            const inOrder = [...front, ...lists.updated];
            return inOrder.map((item) => item.slug);
        }
    }
    return lists.effective.map((item) => item.slug);
}

/**
 * Extract a list of themes from an HTML page.
 * @param listUrl where to access the theme list
 * @returns list of theme slugs.
 */
export async function getItemLists(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    itemType: MetaListItemType,
): Promise<ItemLists> {
    let defaults: Array<ItemType> = [];
    let featured: Array<ItemType> = [];
    let introduced: Array<ItemType> = [];
    let popular: Array<ItemType> = [];
    let interesting: Array<ItemType> = [];
    let rejected: Array<ItemType> = [];
    let updated: Array<ItemType> = [];
    let effective: Array<ItemType>;

    if (!locations[`${itemType}Slugs`].effective) {
        throw new Deno.errors.NotSupported(`an effective list must be persisted`);
    }
    if (locations[`${itemType}Slugs`].defaults) {
        defaults = await getItemList(reporter, jreporter, locations, itemType, 'defaults');
        defaults = listUnique(defaults);
    }
    if (locations[`${itemType}Slugs`].featured) {
        featured = await getItemList(reporter, jreporter, locations, itemType, 'featured');
        featured = listUnique(featured);
    }
    if (locations[`${itemType}Slugs`].new) {
        introduced = await getItemList(reporter, jreporter, locations, itemType, 'new');
        introduced = listUnique(introduced);
    }
    if (locations[`${itemType}Slugs`].popular) {
        popular = await getItemList(reporter, jreporter, locations, itemType, 'popular');
        popular = listUnique(popular);
    }
    if (locations[`${itemType}Slugs`].updated) {
        updated = await getItemList(reporter, jreporter, locations, itemType, 'updated');
        updated = listUnique(updated);
    }
    if (locations[`${itemType}Slugs`].interesting) {
        interesting = await getItemList(reporter, jreporter, locations, itemType, 'interesting');
        interesting = listUnique(interesting);
    }
    if (locations[`${itemType}Slugs`].rejected) {
        rejected = await getItemList(reporter, jreporter, locations, itemType, 'rejected');
        rejected = listUnique(rejected);
    }
    if (interesting.length > 0) {
        defaults = listIntersection(interesting, defaults);
        featured = listIntersection(interesting, featured);
        introduced = listIntersection(interesting, introduced);
        popular = listIntersection(interesting, popular);
        updated = listIntersection(interesting, updated);
        effective = listRemoval(rejected, interesting);
    } else {
        const union = listUnion([popular, updated, introduced, featured, defaults]);
        effective = listRemoval(rejected, union);
    }

    return {
        defaults,
        effective,
        featured,
        interesting,
        'new': introduced,
        popular,
        updated,
        rejected,
    };
}

/**
 * saves the item lists as a set of files.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON logs.
 * @param locations how to find resources.
 * @param options command-line options.
 * @param itemType plugin or theme.
 * @param lists actual lists we want to save.
 */
export async function saveItemLists(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    locations: StandardLocations,
    options: CommandOptions,
    itemType: MetaListItemType,
    lists: ItemLists,
): Promise<void> {
    const perItem = locations[`${itemType}Slugs`] as {
        [Property in MetaListSlug]?: CommonUrlProvider;
    };
    for (const root of META_LIST_SLUG_VALUES) {
        if (perItem[root] && lists[root] && (root !== 'interesting') && (root !== 'rejected')) {
            const { host, pathname } = perItem[root](locations.ctx);
            if (host && pathname) {
                const text = JSON.stringify(lists[root], null, options.jsonSpaces);
                const dirname = path.dirname(pathname);
                await Deno.mkdir(dirname, { recursive: true });
                reporter(`save ${itemType} lists> ${pathname}`);
                jreporter({ operation: 'saveItemLists', name: root, host, pathname, size: lists[root].length });
                await Deno.writeTextFile(pathname, text);
            }
        }
    }
}

/**
 * Read a JSON w/comments file that contains an array of theme slugs.
 * @param filename name of file with either JSON w/comments array or
 *                 a simple list of slugs (with '#' comment lines).
 * @returns list of slugs.
 */
export async function getInterestingSlugs(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    filename: string,
): Promise<Array<string>> {
    const list: Array<string> = [];
    try {
        const contents = await Deno.readTextFile(filename);
        try {
            const jsonc = parse(contents) as unknown;
            if (!Array.isArray(jsonc)) {
                console.error(`Error: JSON w/comments in ${filename} is not an Array.`);
            } else {
                for (let n = 0; n < jsonc.length; n++) {
                    if (typeof jsonc[n] === 'string') {
                        list.push(jsonc[n]);
                    }
                }
            }
            reporter(`getInterestingSlugs: ${filename} as JSON w/comments`);
            jreporter({ operation: 'getInterestingSlugs', format: 'jsonc', size: list.length });
            return list;
        } catch (_) {
            // couldn't parse the file, assume it is a list of slugs
            const all = contents.split(/\r\n|\n|\r/);
            const filtered = all.filter((v) => {
                const trim = v.trim();
                return (trim.length > 0) && !trim.startsWith('#');
            });
            reporter(`getInterestingSlugs: ${filename} as slugs`);
            jreporter({ operation: 'getInterestingSlugs', format: 'slugs', size: filtered.length });
            return filtered;
        }
    } catch (e) {
        console.error(`Error: unable to read file: ${filename} error: ${e}`);
        jreporter({ operation: 'getInterestingSlugs', format: 'unknown', error: e });
        return [];
    }
}

/**
 * read a list of slugs and return as an item list.
 * @param reporter how to report non-error text.
 * @param jreporter how to report structured JSON logs
 * @param filename where to find a list of slugs
 * @param updated optional shared update timestamp
 * @returns slugs reformated as an item list.
 */
async function getInterestingItems(
    reporter: ConsoleReporter,
    jreporter: JsonReporter,
    filename: string,
    updated?: undefined | string,
): Promise<Array<ItemType>> {
    const list: Array<ItemType> = [];
    const slugs = await getInterestingSlugs(reporter, jreporter, filename);
    slugs.forEach((slug) => {
        list.push({ slug, updated });
    });
    return list;
}
