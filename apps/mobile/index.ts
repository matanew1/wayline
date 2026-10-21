// App entry. The car integration has to register before the phone UI mounts: Android Auto can
// start the JS runtime with no phone screen at all.
import { initCar } from './src/car';
import 'expo-router/entry';

initCar();
