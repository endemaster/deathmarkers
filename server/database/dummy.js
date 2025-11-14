module.exports = {
  list: async (levelId, isPlatformer, inclPractice) => {
    return {
      columns: isPlatformer
        ? "x,y"
        : "x,y,percentage",
      deaths: [
        isPlatformer
          ? [100.0, 200.0]
          : [100.0, 200.0, 37]
      ]
    };
  },

  analyze: async () => {
    return [];
  },

  register: async () => {}
};
