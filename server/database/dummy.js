module.exports = {
  list: async (levelId, isPlatformer, inclPractice) => {
    return {
      deaths: [
        // example death → x, y, percentage
        [100, 200, 37]
      ],
      columns: "x,y,percentage"
    };
  },

  analyze: async (levelId, columns) => {
    return [];
  },

  register: async (metadata, deaths) => {
    console.log("REGISTER called:");
    console.log("metadata:", metadata);
    console.log("deaths:", deaths);
  }
};
