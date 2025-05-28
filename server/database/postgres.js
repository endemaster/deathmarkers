const DATABASE = require("../config.json").DATABASE.POSTGRES;
const { Pool } = require("pg");
const format = require("pg-format");

const db = new Pool(DATABASE);

try {
  (async () => {
    const setupQuery = require("fs").readFileSync('./database/postgres-schema.sql', 'utf8');
    await db.query({ text: setupQuery });
  })();
} catch (e) {
  console.error("Error preparing database:");
  console.error(e);
  process.exit(1);
}

module.exports = {

  list: async (levelId, isPlatformer, inclPractice) => {

    let columns = isPlatformer ? "x,y" : "x,y,percentage";
    let where = "WHERE levelid = $1"
      + (isPlatformer ? " AND percentage < 101" : "");
    let query = `SELECT ${columns} FROM format1 ${where}${inclPractice ? "" : " AND practice = false"} ` +
      `UNION SELECT ${columns} FROM format2 ${where}${inclPractice ? "" : " AND practice = false"};`;

    return {
      deaths: (await db.query({
        text: query,
        values: [levelId],
        rowMode: "array"
      })).rows,
      columns
    };

  },

  analyze: async (levelId, columns) => {

    return (await db.query({
      text: `SELECT ${columns} FROM format1 WHERE levelid = $1;`,
      values: [levelId],
      rowMode: "array"
    })).rows;

  },

  register: async (metadata, deaths) => {

    let values = deaths.map(obj => (
      [
        metadata.userident,
        metadata.levelid,
        metadata.levelversion,
        !!obj.practice,
        obj.x,
        obj.y,
        obj.percentage
      ].concat(metadata.format == 2 ? [
        obj.coins,
        obj.itemdata
      ] : [])
    ));

    // format is checked by caller, can be safely included here
    let query = format(`INSERT INTO format${metadata.format} VALUES %L`, values);
    await db.query(query);

  }

}