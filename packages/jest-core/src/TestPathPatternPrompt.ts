/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {Context} from 'jest-runtime';
import {Test} from 'jest-runner';

import {
  PatternPrompt,
  Prompt,
  ScrollOptions,
  printPatternCaret,
  printRestoredPatternCaret,
} from 'jest-watcher';
import SearchSource from './SearchSource';

type SearchSources = Array<{
  context: Context;
  searchSource: SearchSource;
}>;

// TODO: Make underscored props `private`
export default class TestPathPatternPrompt extends PatternPrompt {
  _searchSources?: SearchSources;
  _useSQLite: boolean;

  constructor(pipe: NodeJS.WritableStream, prompt: Prompt, useSQLite: boolean) {
    super(pipe, prompt);
    this._entityName = 'filenames';
    this._useSQLite = useSQLite;
  }

  _onChange(pattern: string, options: ScrollOptions) {
    super._onChange(pattern, options);
    this._printPrompt(pattern);
  }

  _printPrompt(pattern: string) {
    const pipe = this._pipe;
    printPatternCaret(pattern, pipe);
    printRestoredPatternCaret(pattern, this._currentUsageRows, pipe);
  }

  _getMatchedTests(pattern: string): Array<Test> {
    let regex;

    try {
      regex = new RegExp(pattern, 'i');
    } catch (e) {}

    let tests: Array<Test> = [];
    if (regex && this._searchSources) {
      this._searchSources.forEach(({searchSource}) => {
        tests = tests.concat(searchSource.findMatchingTests(this._useSQLite, pattern).tests);
      });
    }

    return tests;
  }

  updateSearchSources(searchSources: SearchSources) {
    this._searchSources = searchSources;
  }
}
