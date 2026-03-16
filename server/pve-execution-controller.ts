/**
 * PvE Execution Controller — Advisory/Descriptor Layer
 *
 * This module produces structured execution descriptors for a browser extension
 * or external automation client. It does NOT directly interact with the DFK game UI.
 *
 * Architecture:
 * - `buildActionExecution()` produces a typed ActionExecution descriptor that specifies
 *   what button to click, what target selection strategy to use, and what state changes
 *   to expect after the action resolves.
 * - `executeActionPipeline()` validates the descriptor against provided UI state and
 *   produces an ExecutionResult with step-by-step status. This is a deterministic
 *   planning function — the actual UI dispatch happens in the consuming extension.
 * - `runSafetyChecks()` enforces safety gates before any auto-execution can proceed.
 *   If any gate fails, the effective mode downgrades to 'recommend_and_confirm'.
 *
 * The consuming browser extension is responsible for:
 * 1. Reading the ActionDispatch descriptor (uiAction, buttonLabel, targetSelectionStrategy)
 * 2. Performing the actual DOM interactions (clicking buttons, selecting targets)
 * 3. Observing the TurnSyncDescriptor to detect when the turn advances
 * 4. Reporting back via /recommendation-outcome with the actual state changes
 */
export type ExecutionMode = 'observe_only' | 'recommend_and_confirm' | 'auto_execute';

export type SafetyBlockReason =
  | 'low_parse_confidence'
  | 'unresolved_ability'
  | 'consumables_unverifiable'
  | 'budget_unverifiable'
  | 'ui_state_mismatch'
  | 'unexpected_popup'
  | 'state_sync_lost';

export interface SafetyCheckResult {
  canAutoExecute: boolean;
  effectiveMode: ExecutionMode;
  blockReasons: SafetyBlockReason[];
  checksPassed: string[];
}

export interface ExecutionContext {
  confidence: number;
  confidenceThreshold: number;
  hasUnresolvedAbility: boolean;
  consumablesVerifiable: boolean;
  budgetVerifiable: boolean;
  uiStateMatch: boolean;
  unexpectedPopup: boolean;
  stateSynced: boolean;
}

export function runSafetyChecks(
  requestedMode: ExecutionMode,
  context: ExecutionContext,
): SafetyCheckResult {
  if (requestedMode === 'observe_only') {
    return {
      canAutoExecute: false,
      effectiveMode: 'observe_only',
      blockReasons: [],
      checksPassed: ['observe_mode'],
    };
  }

  const blockReasons: SafetyBlockReason[] = [];
  const checksPassed: string[] = [];

  if (context.confidence >= context.confidenceThreshold) {
    checksPassed.push('confidence_ok');
  } else {
    blockReasons.push('low_parse_confidence');
  }

  if (!context.hasUnresolvedAbility) {
    checksPassed.push('no_unresolved_abilities');
  } else {
    blockReasons.push('unresolved_ability');
  }

  if (context.consumablesVerifiable) {
    checksPassed.push('consumables_verified');
  } else {
    blockReasons.push('consumables_unverifiable');
  }

  if (context.budgetVerifiable) {
    checksPassed.push('budget_verified');
  } else {
    blockReasons.push('budget_unverifiable');
  }

  if (context.uiStateMatch) {
    checksPassed.push('ui_state_match');
  } else {
    blockReasons.push('ui_state_mismatch');
  }

  if (!context.unexpectedPopup) {
    checksPassed.push('no_popup');
  } else {
    blockReasons.push('unexpected_popup');
  }

  if (context.stateSynced) {
    checksPassed.push('state_synced');
  } else {
    blockReasons.push('state_sync_lost');
  }

  const canAutoExecute = requestedMode === 'auto_execute' && blockReasons.length === 0;
  const effectiveMode: ExecutionMode = canAutoExecute
    ? 'auto_execute'
    : blockReasons.length > 0 && requestedMode === 'auto_execute'
      ? 'recommend_and_confirm'
      : requestedMode;

  return {
    canAutoExecute,
    effectiveMode,
    blockReasons,
    checksPassed,
  };
}

export interface ActionExecution {
  actionType: 'skill' | 'basic_attack' | 'health_vial' | 'mana_vial' | 'save_budget';
  abilityName: string;
  targetSlot?: number;
  confirmed: boolean;
  dispatch: ActionDispatch;
  turnSync: TurnSyncDescriptor;
}

export interface ActionDispatch {
  uiAction: 'click_ability_button' | 'click_consumable' | 'click_basic_attack' | 'skip_turn';
  buttonLabel: string;
  requiresTargetSelection: boolean;
  targetSelectionStrategy: 'frontline' | 'lowest_hp' | 'specific_slot' | 'none';
  confirmAfterSelect: boolean;
  fallbackOnMiss: string;
}

export interface TurnSyncDescriptor {
  expectNewTurnAfterAction: boolean;
  turnDetectionMethod: 'log_parse' | 'ui_state_poll' | 'websocket_event';
  timeoutMs: number;
  retryOnTimeout: boolean;
  expectedStateChanges: string[];
}

export function buildActionExecution(
  recommendedAction: string,
  targetSlot?: number,
  targetPolicy?: Record<string, number> | null,
): ActionExecution {
  const lowerAction = recommendedAction.toLowerCase();
  let actionType: ActionExecution['actionType'] = 'skill';
  let dispatch: ActionDispatch;
  let turnSync: TurnSyncDescriptor;

  const baseTurnSync: TurnSyncDescriptor = {
    expectNewTurnAfterAction: true,
    turnDetectionMethod: 'log_parse',
    timeoutMs: 5000,
    retryOnTimeout: false,
    expectedStateChanges: ['turn_counter_increment'],
  };

  if (lowerAction === 'basic attack' || lowerAction === 'basic_attack') {
    actionType = 'basic_attack';
    dispatch = {
      uiAction: 'click_basic_attack',
      buttonLabel: 'Basic Attack',
      requiresTargetSelection: true,
      targetSelectionStrategy: targetSlot !== undefined ? 'specific_slot' : 'frontline',
      confirmAfterSelect: false,
      fallbackOnMiss: 'retry_basic_attack',
    };
    turnSync = { ...baseTurnSync, expectedStateChanges: ['turn_counter_increment', 'enemy_hp_change'] };
  } else if (lowerAction.includes('health vial')) {
    actionType = 'health_vial';
    dispatch = {
      uiAction: 'click_consumable',
      buttonLabel: 'Health Vial',
      requiresTargetSelection: false,
      targetSelectionStrategy: 'none',
      confirmAfterSelect: false,
      fallbackOnMiss: 'skip_consumable',
    };
    turnSync = { ...baseTurnSync, expectedStateChanges: ['turn_counter_increment', 'hero_hp_change', 'budget_decrease'] };
  } else if (lowerAction.includes('mana vial')) {
    actionType = 'mana_vial';
    dispatch = {
      uiAction: 'click_consumable',
      buttonLabel: 'Mana Vial',
      requiresTargetSelection: false,
      targetSelectionStrategy: 'none',
      confirmAfterSelect: false,
      fallbackOnMiss: 'skip_consumable',
    };
    turnSync = { ...baseTurnSync, expectedStateChanges: ['turn_counter_increment', 'hero_mp_change', 'budget_decrease'] };
  } else if (lowerAction === 'save_budget' || lowerAction === 'save budget') {
    actionType = 'save_budget';
    dispatch = {
      uiAction: 'skip_turn',
      buttonLabel: 'Skip',
      requiresTargetSelection: false,
      targetSelectionStrategy: 'none',
      confirmAfterSelect: false,
      fallbackOnMiss: 'click_basic_attack',
    };
    turnSync = { ...baseTurnSync, expectedStateChanges: ['turn_counter_increment'] };
  } else {
    actionType = 'skill';
    const bestTargetSlot = targetSlot ?? selectBestTarget(targetPolicy);
    dispatch = {
      uiAction: 'click_ability_button',
      buttonLabel: recommendedAction,
      requiresTargetSelection: true,
      targetSelectionStrategy: bestTargetSlot !== undefined ? 'specific_slot' : 'frontline',
      confirmAfterSelect: true,
      fallbackOnMiss: 'click_basic_attack',
    };
    turnSync = { ...baseTurnSync, expectedStateChanges: ['turn_counter_increment', 'enemy_hp_change'] };
  }

  return {
    actionType,
    abilityName: recommendedAction,
    targetSlot: targetSlot ?? selectBestTarget(targetPolicy),
    confirmed: false,
    dispatch,
    turnSync,
  };
}

function selectBestTarget(targetPolicy?: Record<string, number> | null): number | undefined {
  if (!targetPolicy || Object.keys(targetPolicy).length === 0) return undefined;
  let bestSlot: string | undefined;
  let bestProb = -1;
  for (const [slot, prob] of Object.entries(targetPolicy)) {
    if (prob > bestProb) {
      bestProb = prob;
      bestSlot = slot;
    }
  }
  if (bestSlot) {
    const parsed = parseInt(bestSlot, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export interface TurnLogEntry {
  sessionId: string;
  encounterType: string;
  turn: number;
  executionMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  recommendedAction: string;
  recommendedTarget?: number;
  executedAction?: string;
  executedTarget?: number;
  safetyBlockReasons: SafetyBlockReason[];
  confidence: number;
  timestamp: number;
}

export type ExecutionStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface ExecutionStep {
  step: string;
  status: ExecutionStepStatus;
  detail: string;
  timestamp: number;
}

export interface ExecutionResult {
  success: boolean;
  actionExecuted: string;
  targetSlot?: number;
  steps: ExecutionStep[];
  turnAdvanced: boolean;
  stateChangesDetected: string[];
  error?: string;
  fallbackUsed: boolean;
  fallbackAction?: string;
  durationMs: number;
}

export function executeActionPipeline(
  execution: ActionExecution,
  safetyResult: SafetyCheckResult,
  currentUiState: {
    turnNumber: number;
    heroHp: number;
    heroMp: number;
    enemyHp: number;
    battleBudgetRemaining: number | null;
    abilityButtonsVisible: string[];
    consumableButtonsVisible: string[];
    popupPresent: boolean;
  },
): ExecutionResult {
  const startTime = Date.now();
  const steps: ExecutionStep[] = [];
  const stateChangesDetected: string[] = [];

  if (!safetyResult.canAutoExecute) {
    steps.push({
      step: 'safety_gate',
      status: 'failed',
      detail: `Auto-execute blocked: ${safetyResult.blockReasons.join(', ')}`,
      timestamp: Date.now(),
    });
    return {
      success: false,
      actionExecuted: execution.abilityName,
      steps,
      turnAdvanced: false,
      stateChangesDetected,
      error: `Safety gate blocked: ${safetyResult.blockReasons.join(', ')}`,
      fallbackUsed: false,
      durationMs: Date.now() - startTime,
    };
  }

  steps.push({
    step: 'safety_gate',
    status: 'completed',
    detail: `All ${safetyResult.checksPassed.length} safety checks passed`,
    timestamp: Date.now(),
  });

  if (currentUiState.popupPresent) {
    steps.push({
      step: 'popup_check',
      status: 'failed',
      detail: 'Unexpected popup detected — aborting execution',
      timestamp: Date.now(),
    });
    return {
      success: false,
      actionExecuted: execution.abilityName,
      steps,
      turnAdvanced: false,
      stateChangesDetected,
      error: 'unexpected_popup',
      fallbackUsed: false,
      durationMs: Date.now() - startTime,
    };
  }

  steps.push({
    step: 'popup_check',
    status: 'completed',
    detail: 'No popup present',
    timestamp: Date.now(),
  });

  const dispatch = execution.dispatch;
  let buttonFound = false;

  if (dispatch.uiAction === 'click_ability_button' || dispatch.uiAction === 'click_basic_attack') {
    buttonFound = currentUiState.abilityButtonsVisible.some(
      b => b.toLowerCase() === dispatch.buttonLabel.toLowerCase()
    );
  } else if (dispatch.uiAction === 'click_consumable') {
    buttonFound = currentUiState.consumableButtonsVisible.some(
      b => b.toLowerCase() === dispatch.buttonLabel.toLowerCase()
    );
  } else if (dispatch.uiAction === 'skip_turn') {
    buttonFound = true;
  }

  if (!buttonFound) {
    steps.push({
      step: 'locate_button',
      status: 'failed',
      detail: `Button "${dispatch.buttonLabel}" not found in visible UI elements`,
      timestamp: Date.now(),
    });

    if (dispatch.fallbackOnMiss && dispatch.fallbackOnMiss !== 'none') {
      steps.push({
        step: 'fallback_dispatch',
        status: 'completed',
        detail: `Falling back to: ${dispatch.fallbackOnMiss}`,
        timestamp: Date.now(),
      });
      return {
        success: true,
        actionExecuted: dispatch.fallbackOnMiss,
        steps,
        turnAdvanced: false,
        stateChangesDetected,
        fallbackUsed: true,
        fallbackAction: dispatch.fallbackOnMiss,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: false,
      actionExecuted: execution.abilityName,
      steps,
      turnAdvanced: false,
      stateChangesDetected,
      error: `Button not found: ${dispatch.buttonLabel}`,
      fallbackUsed: false,
      durationMs: Date.now() - startTime,
    };
  }

  steps.push({
    step: 'locate_button',
    status: 'completed',
    detail: `Button "${dispatch.buttonLabel}" located via ${dispatch.uiAction}`,
    timestamp: Date.now(),
  });

  steps.push({
    step: 'click_action',
    status: 'completed',
    detail: `Dispatched ${dispatch.uiAction} for "${dispatch.buttonLabel}"`,
    timestamp: Date.now(),
  });

  if (dispatch.requiresTargetSelection) {
    const targetDesc = dispatch.targetSelectionStrategy === 'specific_slot'
      ? `slot ${execution.targetSlot}`
      : dispatch.targetSelectionStrategy;
    steps.push({
      step: 'target_selection',
      status: 'completed',
      detail: `Target selected: ${targetDesc}`,
      timestamp: Date.now(),
    });

    if (dispatch.confirmAfterSelect) {
      steps.push({
        step: 'confirm_target',
        status: 'completed',
        detail: 'Target selection confirmed',
        timestamp: Date.now(),
      });
    }
  } else {
    steps.push({
      step: 'target_selection',
      status: 'skipped',
      detail: 'No target selection required',
      timestamp: Date.now(),
    });
  }

  const turnSync = execution.turnSync;
  for (const change of turnSync.expectedStateChanges) {
    stateChangesDetected.push(change);
  }

  steps.push({
    step: 'turn_sync',
    status: 'completed',
    detail: `Turn sync: expecting ${turnSync.expectedStateChanges.join(', ')} via ${turnSync.turnDetectionMethod} (timeout: ${turnSync.timeoutMs}ms)`,
    timestamp: Date.now(),
  });

  return {
    success: true,
    actionExecuted: execution.abilityName,
    targetSlot: execution.targetSlot,
    steps,
    turnAdvanced: turnSync.expectNewTurnAfterAction,
    stateChangesDetected,
    fallbackUsed: false,
    durationMs: Date.now() - startTime,
  };
}

export function buildTurnLogEntry(
  sessionId: string,
  encounterType: string,
  turn: number,
  requestedMode: ExecutionMode,
  safetyResult: SafetyCheckResult,
  recommendedAction: string,
  recommendedTarget?: number,
  executedAction?: string,
  executedTarget?: number,
  confidence: number = 0,
): TurnLogEntry {
  return {
    sessionId,
    encounterType,
    turn,
    executionMode: requestedMode,
    effectiveMode: safetyResult.effectiveMode,
    recommendedAction,
    recommendedTarget,
    executedAction,
    executedTarget,
    safetyBlockReasons: safetyResult.blockReasons,
    confidence,
    timestamp: Date.now(),
  };
}
