module.exports = {

  list: async (levelId, isPlatformer, inclPractice) => {

    return Promise.resolve({
      deaths: [],
      columns: isPlatformer ? "x,y" : "x,y,percentage"
    });

  },

  analyze: async (levelId, columns) => {

    return Promise.resolve([])

  },

  register: async (metadata, deaths) => {

    console.log(metadata, deaths)

  }

}