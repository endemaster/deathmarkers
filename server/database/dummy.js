module.exports = {
  list: async (levelId, isPlatformer, inclPractice) => {
    const columns = isPlatformer
      ? "userident,levelversion,practice,x,y"
      : "userident,levelversion,practice,x,y,percentage";

    return {
      columns,
      deaths: [
        [
          "0123456789abcdef0123456789abcdef01234567",
          0, // levelversion
          0, // practice
          100.0, // x
          200.0, // y
          ...(isPlatformer ? [] : [37])
        ]
      ]
    };
  },

  analyze: async () => [],
  register: async () => {}
};
