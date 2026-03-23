// server/gameClock.js — Игровое время с настраиваемой скоростью
'use strict';

class GameClock {
  constructor(startDate, speedMultiplier) {
    this.gameTime = new Date(startDate);
    this.speedMultiplier = speedMultiplier; // игровых часов за 1 реальную секунду
    this.paused = true;
    this.tickInterval = null;
    this.tickRate = 250; // мс между тиками
    this.listeners = [];
  }

  start() {
    this.paused = false;
    this.tickInterval = setInterval(() => this.tick(), this.tickRate);
  }

  pause() {
    this.paused = true;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  resume() {
    if (!this.paused) return;
    this.start();
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
  }

  tick() {
    if (this.paused) return;
    // Advance game time
    const gameHoursPerTick = this.speedMultiplier * (this.tickRate / 1000);
    const msAdvance = gameHoursPerTick * 3600 * 1000;
    this.gameTime = new Date(this.gameTime.getTime() + msAdvance);

    for (const fn of this.listeners) {
      fn(this.gameTime);
    }
  }

  onTick(fn) {
    this.listeners.push(fn);
  }

  removeTick(fn) {
    this.listeners = this.listeners.filter(f => f !== fn);
  }

  getTime() {
    return this.gameTime;
  }

  getTimeISO() {
    return this.gameTime.toISOString();
  }

  destroy() {
    this.pause();
    this.listeners = [];
  }
}

module.exports = GameClock;
