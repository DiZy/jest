import serializer from 'jest-serializer';
import {InternalHasteMap, Persistence, FileData, FileCrawlData} from '../types';

class FilePersistence implements Persistence {
  readInternalHasteMap(cachePath: string): InternalHasteMap {
    return serializer.readFileSync(cachePath).internalHasteMap;
  }

  readAllFiles(cachePath: string): FileData {
    return serializer.readFileSync(cachePath).files;
  }

  write(
    cachePath: string,
    internalHasteMap: InternalHasteMap,
    data: FileCrawlData): void {

    const {isFresh, removedFiles, changedFiles} = data;

    if (isFresh) {
      serializer.writeFileSync(cachePath, {internalHasteMap, files: changedFiles});
    }
    else {
      const files = this.readAllFiles(cachePath);
      for(const [removedFilePath] of removedFiles) {
        files.delete(removedFilePath);
      }
      for(const [changedFilePath, changedFile] of changedFiles) {
        if(files.get(changedFilePath)) {
          files.set(changedFilePath, changedFile);
        }
      }
      serializer.writeFileSync(cachePath, {internalHasteMap, files});
    }
  }

  getType() {
    return 'file';
  }
}

export default new FilePersistence();