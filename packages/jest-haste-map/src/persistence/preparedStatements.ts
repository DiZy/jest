import betterSqlLite3 from 'better-sqlite3';
let regexPreparedStmt: betterSqlLite3.Statement | undefined;
export function regexPrepared(db: betterSqlLite3.Database): betterSqlLite3.Statement | undefined{
    console.log("here3");
    if (!regexPreparedStmt) {
        try {
            console.log("here4");
            regexPreparedStmt = db.prepare(`SELECT filePath FROM files WHERE regex(filePath, ?) = 'TRUE'`);
        } catch (e) {
            console.log(e);
        }
    }
    console.log("here5");
    return regexPreparedStmt;
};