module.exports = {

  list: async (levelId, isPlatformer, inclPractice) => {

    return {
      deaths: [],
      columns: isPlatformer ? "x,y" : "x,y,percentage"
    };

  },

  analyze: async (levelId, columns) => {

    return []

  },

  register: async (metadata, deaths) => {

    console.log(metadata, deaths)

  }

}