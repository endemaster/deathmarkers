module.exports = {

  list: async (levelId, isPlatformer, inclPractice) => {

    return Promise.resolve([])

  },

  analyze: async (levelId, columns) => {

    return Promise.resolve([])

  },

  register: async (metadata, deaths) => {

    console.log(metadata, deaths)

  }

}