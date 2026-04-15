module.exports = function handler(_request, response) {
  const config = {
    mapboxToken: process.env.MAPBOX_TOKEN || "",
    countryCodes: process.env.COUNTRY_CODES || "NZ",
  };

  response.setHeader("Content-Type", "application/javascript; charset=utf-8");
  response.status(200).send(`window.APP_CONFIG = ${JSON.stringify(config)};`);
};
