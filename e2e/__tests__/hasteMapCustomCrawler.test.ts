/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs';
import * as path from 'path';
import JestHasteMap from 'jest-haste-map';
import {cleanup} from '../Utils';

// Directory must be here for Watchman to be enabled.
const DIR = path.resolve(__dirname, 'haste_map_custom_crawler');
const customCrawlerDir = path.resolve(DIR, '../../custom-crawler');

const myCrawler = path.resolve(customCrawlerDir, 'my-crawler.js');
const removedFilesCrawler = path.resolve(customCrawlerDir, 'my-removed-files-crawler');
const changedFilesCrawler = path.resolve(customCrawlerDir, 'my-changed-files-crawler');

beforeAll(() => {
    cleanup(DIR);
    
    const fooPath = path.resolve(DIR, 'foo.test.js');
    const barPath = path.resolve(DIR, 'bar.test.js');
    const fooBarPath = path.resolve(DIR, 'foobar.test.js');

    fs.mkdirSync(DIR);
    fs.writeFileSync(fooPath, "test('stub', () => expect(2).toBe(2));");
    fs.writeFileSync(barPath, "test('stub', () => expect(2).toBe(2));");
    fs.writeFileSync(fooBarPath, "test('stub', () => expect(2).toBe(2));");
});
afterAll(() => cleanup(DIR));

const createMap = obj => new Map(Object.keys(obj).map(key => [key, obj[key]]));

const hasteConfig = {
  computeSha1: false,
  customCrawler: myCrawler,
  extensions: ['js', 'json', 'png'],
  forceNodeFilesystemAPI: false,
  ignorePattern: / ^/,
  maxWorkers: 2,
  mocksPattern: '__mocks__',
  name: 'tmp_' + Date.now(),
  platforms: [],
  retainAllFiles: false,
  rootDir: DIR,
  roots: [DIR],
  throwOnModuleCollision: true,
  useWatchman: true,
  watch: false,
};

describe('should build haste map using custom crawler', () => {
  it('should initially create using custom crawler provided', async () => {
    const {__hasteMapForTest} = await new JestHasteMap(hasteConfig).build();
    expect(__hasteMapForTest.files).toEqual(createMap({ 'foo.test.js': [ '', 0, 0, 1, '', null ] }));
    expect(__hasteMapForTest.clocks).toEqual(createMap({'relativeRoot': 'newClock'}));
  });

  it('should remove files', async () => {
    hasteConfig.customCrawler = removedFilesCrawler;
    const {__hasteMapForTest} = await new JestHasteMap(hasteConfig).build();
    expect(__hasteMapForTest.files).toEqual(createMap({ 'bar.test.js': [ '', 0, 0, 1, '', null ] }));
    expect(__hasteMapForTest.clocks).toEqual(createMap({'relativeRoot': 'removedFilesClock'}));
  });

  it('should add files incrementally from changed files', async () => {
    hasteConfig.customCrawler = changedFilesCrawler;
    const {__hasteMapForTest} = await new JestHasteMap(hasteConfig).build();
    expect(__hasteMapForTest.files).toEqual(createMap({
      'bar.test.js': [ '', 0, 0, 1, '', null ],
      'foobar.test.js': [ '', 0, 0, 1, '', null ],
    }));
    expect(__hasteMapForTest.clocks).toEqual(createMap({'relativeRoot': 'changedFilesClock'}));
  });

  it('should remove everything if isFresh', async () => {
    hasteConfig.customCrawler = myCrawler;
    const {__hasteMapForTest} = await new JestHasteMap(hasteConfig).build();
    expect(__hasteMapForTest.files).toEqual(createMap({ 'foo.test.js': [ '', 0, 0, 1, '', null ] }));
    expect(__hasteMapForTest.clocks).toEqual(createMap({'relativeRoot': 'newClock'}));
  });
});
