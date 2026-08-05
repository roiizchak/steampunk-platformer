import Phaser from 'phaser';
import { gameConfig } from './game/config';
import { installDebugGlobals } from './debug/globals';

installDebugGlobals();

new Phaser.Game(gameConfig);
