/**
 * CarPlay / Android Auto native code is linked only for builds made with WAYLINE_CAR=1
 * (it needs Apple's CarPlay navigation entitlement and Google's car-app review). Everyone
 * else gets a build without it, so the car library can never break the regular app build.
 */
const car = process.env.WAYLINE_CAR === '1';

module.exports = {
  dependencies: car
    ? {}
    : { '@g4rb4g3/react-native-carplay': { platforms: { ios: null, android: null } } },
};
