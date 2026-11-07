// Solo para la demo de GitHub Pages: EXPO_BASE_URL=/ancla publica la app bajo esa ruta.
// Sin la variable, la configuración es la de app.json, sin cambios.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments ?? {}), ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
