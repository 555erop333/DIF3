// server/contractHistory.js — История договоров
'use strict';

const { CONTRACT_STATUS } = require('../shared/constants');

// Доля оплаты при завершении контракта
function getRemainingPaymentRatio(terms) {
  if (terms === '100% до погрузки') return 0;
  if (terms === '50% до погрузки, 50% после выгрузки') return 0.5;
  if (terms === '30% до погрузки, 70% после выгрузки') return 0.7;
  if (terms === '100% после выгрузки') return 1.0;
  return 0;
}

function createContract(gameState, offer) {
  const id = 'contract_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const contract = {
    id,
    offerId: offer.id,
    chartererId: offer.chartererId,
    chartererName: offer.chartererName,
    shipOwnerId: offer.shipOwnerId,
    shipOwnerName: offer.shipOwnerName,
    shipId: offer.assignedShipId,
    shipName: offer.assignedShipName,
    originPort: offer.originPort,
    destPort: offer.destPort,
    cargoType: offer.cargoType,
    tons: offer.tons,
    freightRate: offer.freightRate,
    // Сроки
    laydays: offer.laydays,
    cancelling: offer.cancelling,
    // Демередж/Диспач ставки
    demurrageLoading: offer.demurrageLoading,
    demurrageUnloading: offer.demurrageUnloading,
    dispatchLoading: offer.dispatchLoading,
    dispatchUnloading: offer.dispatchUnloading,
    // Условия
    paymentTerms: offer.paymentTerms,
    cargoHandling: offer.cargoHandling,
    charterProforma: offer.charterProforma,
    // Даты
    createdAt: gameState.clock.getTimeISO(),
    loadingStarted: null,
    loadingCompleted: null,
    departureTime: null,
    arrivalTime: null,
    unloadingStarted: null,
    unloadingCompleted: null,
    completedAt: null,
    // Финансы
    demurrageCharged: 0,
    dispatchEarned: 0,
    totalPaid: 0,
    // Статус
    status: CONTRACT_STATUS.IN_PROGRESS,
  };

  gameState.contracts[id] = contract;
  return contract;
}

function completeContract(gameState, contractId) {
  const contract = gameState.contracts[contractId];
  if (!contract) return;

  contract.status = CONTRACT_STATUS.COMPLETED;
  contract.completedAt = gameState.clock.getTimeISO();

  // Оплата оставшейся части фрахта
  const remainingRatio = getRemainingPaymentRatio(contract.paymentTerms);
  if (remainingRatio > 0) {
    const remaining = Math.round(contract.freightRate * remainingRatio);
    const gameStateModule = require('./gameState');
    gameStateModule.adjustBalance(contract.chartererId, -remaining,
      `Фрахт (остаток ${Math.round(remainingRatio * 100)}%): договор ${contractId}`);
    gameStateModule.adjustBalance(contract.shipOwnerId, remaining,
      `Фрахт (остаток ${Math.round(remainingRatio * 100)}%): договор ${contractId}`);
    contract.totalPaid = contract.freightRate;
  }

  // Расчёт демереджа/диспача
  calcDemurrageDispatch(gameState, contract);
}

function calcDemurrageDispatch(gameState, contract) {
  const { calcProcessingTime } = require('./referenceData');
  const ship = gameState.ships[contract.shipId];
  if (!ship) return;

  const project = ship.project;

  // Расчёт для погрузки
  if (contract.loadingStarted && contract.loadingCompleted) {
    const actualDays = (new Date(contract.loadingCompleted) - new Date(contract.loadingStarted)) / (24 * 3600 * 1000);
    const normDays = calcProcessingTime(contract.tons, contract.originPort, contract.cargoType, 'loading', project);

    const diff = actualDays - normDays;
    if (diff > 0 && contract.demurrageLoading > 0) {
      contract.demurrageCharged += Math.round(diff * contract.demurrageLoading);
    } else if (diff < 0 && contract.dispatchLoading > 0) {
      contract.dispatchEarned += Math.round(Math.abs(diff) * contract.dispatchLoading);
    }
  }

  // Расчёт для разгрузки
  if (contract.unloadingStarted && contract.unloadingCompleted) {
    const actualDays = (new Date(contract.unloadingCompleted) - new Date(contract.unloadingStarted)) / (24 * 3600 * 1000);
    const normDays = calcProcessingTime(contract.tons, contract.destPort, contract.cargoType, 'unloading', project);

    const diff = actualDays - normDays;
    if (diff > 0 && contract.demurrageUnloading > 0) {
      contract.demurrageCharged += Math.round(diff * contract.demurrageUnloading);
    } else if (diff < 0 && contract.dispatchUnloading > 0) {
      contract.dispatchEarned += Math.round(Math.abs(diff) * contract.dispatchUnloading);
    }
  }

  // Демередж: фрахтователь платит судовладельцу
  if (contract.demurrageCharged > 0) {
    const gameStateModule = require('./gameState');
    gameStateModule.adjustBalance(contract.chartererId, -contract.demurrageCharged,
      `Демередж: договор ${contract.id}`);
    gameStateModule.adjustBalance(contract.shipOwnerId, contract.demurrageCharged,
      `Демередж: договор ${contract.id}`);
  }

  // Диспач: судовладелец платит фрахтователю
  if (contract.dispatchEarned > 0) {
    const gameStateModule = require('./gameState');
    gameStateModule.adjustBalance(contract.shipOwnerId, -contract.dispatchEarned,
      `Диспач: договор ${contract.id}`);
    gameStateModule.adjustBalance(contract.chartererId, contract.dispatchEarned,
      `Диспач: договор ${contract.id}`);
  }
}

function getContracts(gameState, playerId) {
  return Object.values(gameState.contracts).filter(c =>
    c.chartererId === playerId || c.shipOwnerId === playerId
  );
}

function registerEvents(io, socket) {
  socket.on('contracts:getList', (_, callback) => {
    const gameState = require('./gameState').getState();
    if (!gameState) return callback && callback({ contracts: [] });
    callback({ contracts: getContracts(gameState, socket.id) });
  });
}

module.exports = { createContract, completeContract, getContracts, registerEvents };
