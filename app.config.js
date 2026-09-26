require("dotenv").config({ path: "./app/.env" });
process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ||= process.env.RNMAPBOX_DOWNLOAD_TOKEN;

module.exports = ({ config }) => {
  const downloadToken = process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN;
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return {
    ...config,
    extra: {
      ...config.extra,
      mapboxAccessToken: accessToken,
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(downloadToken
        ? ["@rnmapbox/maps"]
        : []),
    ],
  };
};
